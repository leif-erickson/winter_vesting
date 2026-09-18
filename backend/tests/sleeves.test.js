'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  SLEEVE_IDS,
  ACTIVE_PAPER_SLEEVE,
  DEFAULT_SLEEVE_EQUITY,
  clampRiskPct,
  plannedR,
  splitPnlBySleeve,
  sleeveOfTrade,
  isToyPaperAccount,
  loadSleeves,
  sleevesSnapshot,
} = require('../lib/sleeves');
const { loadConfig } = require('../lib/config');
const { isLiveEnabled, LIVE_SWITCH } = require('../lib/robinhood');
const { assertPaperOnly } = require('../lib/alpacaPaper');

describe('Alpaca paper sleeves', () => {
  it('defines four sleeves, parks unused, and keeps intraday active for paper:daily', () => {
    const pack = loadSleeves({});
    assert.deepEqual(pack.ids, ['intraday', 'multi_day', 'crypto', 'options']);
    assert.equal(pack.activeId, ACTIVE_PAPER_SLEEVE);
    assert.equal(pack.sleeves.intraday.status, 'active');
    assert.equal(pack.sleeves.multi_day.status, 'parked');
    assert.equal(pack.sleeves.crypto.status, 'parked');
    assert.equal(pack.sleeves.options.status, 'parked');
    assert.equal(pack.startingEquity, DEFAULT_SLEEVE_EQUITY);
    assert.equal(pack.buyingPowerMental, 400000);
    assert.equal(pack.rhResearchCash, 100);
    assert.equal(pack.riskPct, 0.01);
  });

  it('does not activate parked sleeves even if PAPER_ACTIVE_SLEEVE is set', () => {
    const pack = loadSleeves({ PAPER_ACTIVE_SLEEVE: 'crypto' });
    assert.equal(pack.activeId, 'intraday');
    assert.equal(pack.sleeves.crypto.status, 'parked');
    assert.equal(pack.sleeves.intraday.status, 'active');
  });

  it('clamps PAPER_SLEEVE_RISK_PCT into 1–2%', () => {
    assert.equal(clampRiskPct(0.015), 0.015);
    assert.equal(clampRiskPct('0.05'), 0.02);
    assert.equal(clampRiskPct('0.001'), 0.01);
    assert.equal(loadSleeves({ PAPER_SLEEVE_RISK_PCT: '0.02' }).riskPct, 0.02);
    assert.equal(loadSleeves({ PAPER_SLEEVE_RISK_PCT: '0.9' }).riskPct, 0.02);
  });

  it('keeps PAPER_CASH as the RH research budget, not sleeve equity', () => {
    const config = loadConfig({ PAPER_CASH: '100', PAPER_SLEEVE_EQUITY: '100000' });
    assert.equal(config.rhResearchCash, 100);
    assert.equal(config.startingCash, 100000);
    assert.equal(config.activeSleeve, 'intraday');
    assert.equal(config.maxEntriesPerDay, 0);
  });

  it('splits P&L into intraday vs multi-day with parked stubs', () => {
    const split = splitPnlBySleeve([
      { features: { sleeve: 'intraday' }, pnl: 12.5, asset_class: 'stocks' },
      { features: { sleeve: 'intraday' }, pnl: -2.5, asset_class: 'stocks' },
      { sleeve: 'multi_day', pnl: 3, asset_class: 'stocks' },
    ]);
    assert.equal(split.pnl.intraday, 10);
    assert.equal(split.pnl.multi_day, 3);
    assert.equal(split.pnl.crypto, 0);
    assert.equal(split.pnl.options, 0);
    assert.equal(split.counts.intraday, 2);
    assert.equal(sleeveOfTrade({ asset_class: 'crypto' }), 'crypto');
  });

  it('treats leftover $100 journal rows as the toy book to rebase', () => {
    assert.equal(isToyPaperAccount({ starting_cash: 100 }, 100000), true);
    assert.equal(isToyPaperAccount({ starting_cash: 100000 }, 100000), false);
    assert.equal(isToyPaperAccount(null, 100000), true);
  });

  it('exposes sleeves on the research edge snapshot and does not enable live', () => {
    const snap = sleevesSnapshot(loadConfig().paperSleeves);
    assert.equal(snap.sleeves.length, 4);
    assert.equal(snap.activeId, 'intraday');
    assert.match(snap.note, /separate book/);
    assert.equal(LIVE_SWITCH, false);
    assert.equal(isLiveEnabled({ ROBINHOOD_LIVE: '1' }), false);
    assert.throws(
      () => assertPaperOnly({ ALPACA_LIVE: '1' }),
      (err) => err.code === 'ALPACA_LIVE_REFUSED'
    );
  });

  it('computes planned R in the 1–2 band for 1.5R targets', () => {
    const r = plannedR({ price: 10, stop: 9, target: 11.5 });
    assert.ok(r > 1.49 && r < 1.51);
  });
});
