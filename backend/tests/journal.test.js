'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStore } = require('../lib/store');

describe('journal', () => {
  it('writes an open paper trade and closes it with outcome', async () => {
    const store = createMemoryStore();
    const opened = await store.insertTrade({
      symbol: 'SOFI',
      ts: '2024-03-04T10:00:00-04:00',
      side: 'BUY',
      setupId: 'orb_breakout',
      features: { rsi: 55, vwap: 10.1, rvol: 1.8, sessionDate: '2024-03-04' },
      reason: 'OR breakout: close 10.40 > ORH 10.20',
      paperPrice: 10.4,
      size: 2.4,
      notional: 24.96,
      stop: 9.8,
      target: 11.3,
      status: 'open',
      mode: 'paper',
    });
    assert.ok(opened.id);
    assert.equal(opened.status, 'open');
    assert.equal(opened.mode, 'paper');

    const closed = await store.closeTrade(opened.id, {
      exitTs: '2024-03-04T11:00:00-04:00',
      exitPrice: 10.9,
      pnl: (10.9 - 10.4) * 2.4,
      outcome: 'win',
    });
    assert.equal(closed.status, 'closed');
    assert.equal(closed.outcome, 'win');
    assert.ok(Number(closed.pnl) > 0);

    const listed = await store.listTrades({ limit: 10 });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].symbol, 'SOFI');
    assert.match(listed[0].reason, /OR breakout/);
  });

  it('defaults new setups to paper and not live-eligible', async () => {
    const store = createMemoryStore();
    const setups = await store.listSetups();
    assert.ok(setups.length >= 3);
    for (const setup of setups) {
      assert.equal(setup.status, 'paper');
      assert.equal(setup.live_eligible, false);
    }
  });
});
