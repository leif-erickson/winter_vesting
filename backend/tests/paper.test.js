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

describe('paper risk / cash account', () => {
  const config = loadConfig({ PAPER_CASH: '100' });

  it('caps a single name so it cannot consume the $100 account', () => {
    const cheap = sizePosition({ settledCash: 100, price: 10, startingCash: 100, maxPositionPct: 0.25 });
    assert.ok(cheap.notional <= 25.001);
    assert.ok(cheap.shares > 0);

    const expensive = sizePosition({ settledCash: 100, price: 410, startingCash: 100, maxPositionPct: 0.25 });
    assert.ok(expensive.shares > 0);
    assert.ok(expensive.shares < 1, 'BRK.B is fractional');
    assert.ok(expensive.notional <= 25.001);
  });

  it('does not reuse sold proceeds until the next session (T+1)', () => {
    let account = createAccount(100);
    const bought = buy(account, { price: 10, shares: 2 });
    assert.equal(bought.ok, true);
    account = bought.account;
    assert.equal(account.settledCash, 80);

    const sold = sell(account, { price: 11, shares: 2, avgPrice: 10 });
    account = sold.account;
    assert.equal(sold.settledReusable, false);
    assert.equal(account.settledCash, 80);
    assert.equal(account.unsettledCash, 22);

    const second = buy(account, { price: 10, shares: 9 });
    assert.equal(second.ok, false);

    account = maybeNewSession(account, '2024-03-05');
    assert.equal(account.settledCash, 102);
    assert.equal(account.unsettledCash, 0);
  });

  it('kill switch blocks entries after a daily loss breach', () => {
    const account = { ...createAccount(100), equity: 90, dayStartEquity: 100, entriesToday: 0 };
    const gate = allowEntry(account, config, 0);
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, 'daily_loss_kill_switch');
  });

  it('blocks a second concurrent position on the $100 account', () => {
    const account = createAccount(100);
    const gate = allowEntry(account, config, 1);
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, 'max_open_positions');
  });
});
