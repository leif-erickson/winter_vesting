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
    assert.equal(listed[0].asset_class, 'stocks');
    assert.match(listed[0].reason, /OR breakout/);
  });

  it('persists AMT labels on journal features and does not require SMC/VSA tags', async () => {
    const store = createMemoryStore();
    const opened = await store.insertTrade({
      symbol: 'SOFI',
      ts: '2024-03-04T10:00:00-04:00',
      side: 'BUY',
      setupId: 'orb_breakout',
      features: {
        sessionDate: '2024-03-04',
        rvol: 1.8,
        vwap: 10.1,
        orHigh: 10.2,
        facets: ['or_break', 'above_vwap', 'rvol'],
        amt: {
          or_break: 'initial_balance',
          above_vwap: 'value',
          rvol: 'participation',
        },
      },
      reason: 'OR breakout',
      paperPrice: 10.4,
      size: 2.4,
      notional: 24.96,
      status: 'open',
      mode: 'paper',
    });
    assert.equal(opened.features.amt.or_break, 'initial_balance');
    assert.equal(opened.features.researchTags, undefined);
    assert.deepEqual(opened.features.facets, ['or_break', 'above_vwap', 'rvol']);
    assert.equal(opened.mode, 'paper');
  });

  it('stores a nullable broker_order_id without requiring it', async () => {
    const store = createMemoryStore();
    const opened = await store.insertTrade({
      symbol: 'SOFI',
      ts: '2024-03-04T10:00:00-04:00',
      side: 'BUY',
      setupId: 'orb_breakout',
      features: {},
      reason: 'test',
      paperPrice: 10,
      size: 1,
      notional: 10,
      status: 'open',
      mode: 'paper',
    });
    assert.equal(opened.broker_order_id, null);
    const updated = await store.setBrokerOrderId(opened.id, 'ord-paper-1');
    assert.equal(updated.broker_order_id, 'ord-paper-1');
  });

  it('upserts the same symbol/ts/setup/side without allocating a new id', async () => {
    const store = createMemoryStore();
    const payload = {
      symbol: 'SOFI',
      ts: '2024-03-04T10:00:00-04:00',
      side: 'BUY',
      setupId: 'orb_breakout',
      features: { sessionDate: '2024-03-04' },
      reason: 'first',
      paperPrice: 10.4,
      size: 2,
      notional: 20.8,
      status: 'open',
      mode: 'paper',
    };
    const first = await store.upsertTrade(payload);
    const second = await store.upsertTrade({ ...payload, reason: 'updated', paperPrice: 10.5, notional: 21 });
    assert.equal(second.id, first.id);
    const listed = await store.listTrades({ limit: 10 });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].reason, 'updated');
    assert.equal(Number(listed[0].paper_price), 10.5);
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
