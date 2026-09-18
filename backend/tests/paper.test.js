'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  sizePosition,
  createAccount,
  maybeNewSession,
  allowEntry,
  buy,
  sell,
} = require('../lib/paper');
const { loadConfig } = require('../lib/config');

describe('paper risk / sleeve account', () => {
  const config = loadConfig({ PAPER_SLEEVE_EQUITY: '100000', PAPER_SLEEVE_RISK_PCT: '0.01' });

  it('sizes 1% of the 100k intraday sleeve from stop distance, not the $100 toy cap', () => {
    const sized = sizePosition({
      settledCash: 100000,
      price: 10,
      stop: 9.5,
      target: 10.75,
      sleeveEquity: 100000,
      riskPct: 0.01,
    });
    assert.equal(sized.reason, undefined);
    assert.ok(sized.shares > 0);
    assert.equal(sized.riskPct, 0.01);
    assert.ok(Math.abs(sized.riskDollars - 1000) < 1, `riskDollars ${sized.riskDollars}`);
    assert.ok(sized.notional > 100, 'must not be the $25/$100 toy notional');
    assert.ok(sized.notional <= 100000);
    assert.ok(sized.plannedR > 1.4 && sized.plannedR < 1.6);
  });

  it('clamps requested risk into the 1–2% band', () => {
    const high = sizePosition({
      settledCash: 100000,
      price: 20,
      stop: 19,
      target: 21.5,
      sleeveEquity: 100000,
      riskPct: 0.05,
    });
    assert.equal(high.riskPct, 0.02);
    const low = sizePosition({
      settledCash: 100000,
      price: 20,
      stop: 19,
      target: 21.5,
      sleeveEquity: 100000,
      riskPct: 0.001,
    });
    assert.equal(low.riskPct, 0.01);
  });

  it('skips when planned R is outside the 1–2 band', () => {
    const skinny = sizePosition({
      settledCash: 100000,
      price: 10,
      stop: 9,
      target: 10.2,
      sleeveEquity: 100000,
      riskPct: 0.01,
    });
    assert.equal(skinny.shares, 0);
    assert.equal(skinny.reason, 'planned_r_outside_band');
  });

  it('caps notional at sleeve cash when a tight stop would need leverage to hit 1% risk', () => {
    const tight = sizePosition({
      settledCash: 100000,
      price: 400,
      stop: 399.99,
      target: 400.015,
      sleeveEquity: 100000,
      riskPct: 0.01,
    });
    assert.ok(tight.shares > 0);
    assert.ok(tight.notional <= 100000 + 1e-6);
    assert.equal(tight.capped, true);
    assert.ok(tight.realizedRiskPct < 0.01);
  });

  it('does not apply T+1 on the Alpaca paper sleeve so the same symbol may re-enter', () => {
    let account = createAccount(100000);
    const bought = buy(account, { price: 10, shares: 100 });
    assert.equal(bought.ok, true);
    account = bought.account;
    const sold = sell(account, { price: 11, shares: 100, avgPrice: 10 });
    account = sold.account;
    assert.equal(sold.settledReusable, true);
    assert.equal(account.settledCash, 100000 + 100);
    const second = buy(account, { price: 10, shares: 100 });
    assert.equal(second.ok, true);
  });

  it('keeps T+1 when explicitly requested (RH research model, not paper:daily)', () => {
    let account = createAccount(100, { settlement: 't1' });
    const bought = buy(account, { price: 10, shares: 2 });
    account = bought.account;
    const sold = sell(account, { price: 11, shares: 2, avgPrice: 10, settlement: 't1' });
    account = sold.account;
    assert.equal(sold.settledReusable, false);
    assert.equal(account.settledCash, 80);
    account = maybeNewSession(account, '2024-03-05');
    assert.equal(account.settledCash, 102);
  });

  it('has no 1-trade/day cap by default', () => {
    const account = { ...createAccount(100000), entriesToday: 8 };
    const gate = allowEntry(account, config, 0);
    assert.equal(gate.ok, true);
    assert.equal(config.maxEntriesPerDay, 0);
  });

  it('kill switch blocks entries after a daily loss breach', () => {
    const account = { ...createAccount(100000), equity: 90000, dayStartEquity: 100000, entriesToday: 0 };
    const gate = allowEntry(account, config, 0);
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, 'daily_loss_kill_switch');
  });

  it('still blocks a second concurrent position', () => {
    const account = createAccount(100000);
    const gate = allowEntry(account, config, 1);
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, 'max_open_positions');
  });
});
