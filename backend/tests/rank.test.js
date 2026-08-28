'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PROMOTION_GATES } = require('../lib/config');
const {
  walkForwardFolds,
  rankSetup,
  clearsPromotionGate,
  promotionDecision,
  rankAndPromote,
} = require('../lib/rank');
const { createMemoryStore } = require('../lib/store');
const { SETUPS } = require('../lib/config');

function trade(date, pnl, setupId = 'orb_breakout') {
  return {
    setupId,
    sessionDate: date,
    status: 'closed',
    pnl,
    ts: `${date}T10:05:00-04:00`,
  };
}

function dates(n, start = '2024-03-01') {
  const out = [];
  const t0 = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i += 1) {
    const d = new Date(t0.getTime() + i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe('ranking / promotion', () => {
  it('builds rolling train/test folds without using the full sample as OOS', () => {
    const folds = walkForwardFolds(dates(12), 5, 2);
    assert.ok(folds.length >= 3);
    for (const fold of folds) {
      assert.equal(fold.train.length, 5);
      assert.equal(fold.test.length, 2);
      assert.ok(fold.train.every((d) => d < fold.test[0]));
    }
  });

  it('promotes only after OOS gates clear', () => {
    const days = dates(16);
    const winners = days.map((d) => trade(d, 1.5));
    const winMetrics = rankSetup(winners);
    assert.ok(winMetrics.trades >= PROMOTION_GATES.minOosTrades);
    assert.equal(clearsPromotionGate(winMetrics, PROMOTION_GATES), true);
    assert.equal(promotionDecision(winMetrics, PROMOTION_GATES).liveEligible, true);
    assert.equal(promotionDecision(winMetrics, PROMOTION_GATES).status, 'live-eligible');

    const losers = days.map((d) => trade(d, -1.2));
    const loseMetrics = rankSetup(losers);
    assert.equal(clearsPromotionGate(loseMetrics, PROMOTION_GATES), false);
    assert.equal(promotionDecision(loseMetrics, PROMOTION_GATES).status, 'paper');
  });

  it('keeps a thin or inconsistent setup on paper', () => {
    const few = [trade('2024-03-04', 2), trade('2024-03-05', 1)];
    const metrics = rankSetup(few);
    assert.equal(clearsPromotionGate(metrics, PROMOTION_GATES), false);
  });

  it('persists promotion as live-eligible without enabling live execution', async () => {
    const store = createMemoryStore();
    const days = dates(16);
    const trades = days.map((d) => trade(d, 1.25, 'orb_breakout'));
    const ranked = await rankAndPromote(store, {
      setups: SETUPS,
      gates: PROMOTION_GATES,
      trades,
    });
    const orb = ranked.find((r) => r.setupId === 'orb_breakout');
    assert.equal(orb.liveEligible, true);
    const saved = (await store.listSetups()).find((s) => s.id === 'orb_breakout');
    assert.equal(saved.live_eligible, true);
    assert.equal(saved.status, 'live-eligible');
    const { isLiveEnabled } = require('../lib/robinhood');
    assert.equal(isLiveEnabled({ ROBINHOOD_LIVE: '1' }), false);
  });
});
