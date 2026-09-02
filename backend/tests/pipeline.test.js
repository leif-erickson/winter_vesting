'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, DEFAULT_REPLAY_DAYS } = require('../lib/config');
const { createMemoryStore } = require('../lib/store');
const { createBarsClient } = require('../lib/bars');
const { runReplay, runRank } = require('../lib/pipeline');
const { LIVE_SWITCH, isLiveEnabled } = require('../lib/robinhood');

function seedKeepTrade(store, overrides = {}) {
  return store.insertTrade({
    symbol: 'KEEP',
    ts: '2010-01-01T10:00:00-05:00',
    side: 'BUY',
    setupId: 'orb_breakout',
    features: { sessionDate: '2010-01-01' },
    reason: 'seed row that replay must not drop',
    paperPrice: 10,
    size: 1,
    notional: 10,
    status: 'closed',
    mode: 'paper',
    pnl: 0.5,
    outcome: 'win',
    ...overrides,
  });
}

function wrapResetCounter(store) {
  let resetCalls = 0;
  const orig = store.resetPaper.bind(store);
  store.resetPaper = async (...args) => {
    resetCalls += 1;
    return orig(...args);
  };
  return {
    get count() {
      return resetCalls;
    },
  };
}

describe('paper pipeline', () => {
  it('replays synthetic 5m bars, journals trades, and ranks setups', async () => {
    const config = loadConfig({ PAPER_CASH: '100', DAYTRADE_UNIVERSE: 'SOFI,PLTR' });
    const store = createMemoryStore();
    const barsClient = createBarsClient({ env: {} });
    const result = await runReplay({
      store,
      barsClient,
      config,
      days: 20,
      persist: true,
    });
    assert.equal(result.source, 'synthetic');
    assert.equal(result.reset, false);
    assert.ok(result.signals >= 1, 'expected at least one method to produce signals');
    assert.ok(result.trades >= 1, 'expected journaled paper trades');
    assert.ok(result.account.equity > 0);
    assert.ok(result.account.equity <= 100 + 50);
    const trades = await store.listTrades({ limit: 50 });
    assert.ok(trades[0].reason);
    assert.equal(trades[0].mode, 'paper');
    assert.equal(trades[0].asset_class, 'stocks');
    assert.ok(result.rankings.length >= 1);
    assert.equal(result.liveEnabled, false);
    assert.equal(LIVE_SWITCH, false);
    const withAmt = trades.find((t) => t.features?.amt);
    assert.ok(withAmt, 'expected journaled features to carry AMT labels');
    assert.equal(withAmt.features.amt.rvol, 'participation');
    assert.ok(Array.isArray(withAmt.features.facets));
    assert.ok(withAmt.features.facets.length <= 5);
    assert.equal(withAmt.features.facets.includes('fvg'), false);
    for (const row of result.rankings) {
      if (row.liveEligible) {
        assert.equal(row.status, 'live-eligible');
      } else {
        assert.equal(row.status, 'paper');
      }
    }
  });

  it('rank on a non-empty journal does not drop row count or call resetPaper', async () => {
    const config = loadConfig({ PAPER_CASH: '100', DAYTRADE_UNIVERSE: 'SOFI,PLTR' });
    const store = createMemoryStore();
    await store.upsertCandles([
      {
        symbol: 'SOFI',
        timeframe: '5m',
        ts: '2024-03-04T09:30:00-04:00',
        open: 10,
        high: 10.2,
        low: 9.9,
        close: 10.1,
        volume: 1000,
        sessionDate: '2024-03-04',
        minuteOfDay: 570,
        source: 'test',
      },
    ]);
    for (let i = 0; i < 5; i += 1) {
      await seedKeepTrade(store, {
        symbol: 'SOFI',
        ts: `2024-03-0${i + 1}T10:00:00-04:00`,
        reason: `seed ${i}`,
      });
    }
    const beforeTrades = await store.listTrades({ limit: 5000 });
    const beforeCandles = await store.candleStats();
    const resets = wrapResetCounter(store);
    const result = await runRank({ store, config });
    const afterTrades = await store.listTrades({ limit: 5000 });
    const afterCandles = await store.candleStats();
    assert.equal(afterTrades.length, beforeTrades.length);
    assert.deepEqual(afterTrades.map((t) => t.id).sort(), beforeTrades.map((t) => t.id).sort());
    assert.equal(afterCandles.bars, beforeCandles.bars);
    assert.equal(resets.count, 0);
    assert.equal(result.journalPreserved, true);
    assert.equal(result.liveEnabled, false);
    assert.equal(isLiveEnabled({ ROBINHOOD_LIVE: '1' }), false);
    assert.ok(result.rankings.length >= 1);
  });

  it('replay without --reset does not drop existing ids', async () => {
    const config = loadConfig({ PAPER_CASH: '100', DAYTRADE_UNIVERSE: 'SOFI,PLTR' });
    const store = createMemoryStore();
    const barsClient = createBarsClient({ env: {} });
    const seeded = await seedKeepTrade(store);
    const resets = wrapResetCounter(store);
    await runReplay({
      store,
      barsClient,
      config,
      days: 8,
      persist: true,
      reset: false,
    });
    const afterFirst = await store.listTrades({ limit: 5000 });
    assert.ok(afterFirst.some((t) => t.id === seeded.id), 'seeded id must survive append replay');
    const ids = new Set(afterFirst.map((t) => t.id));
    await runReplay({
      store,
      barsClient,
      config,
      days: 8,
      persist: true,
      reset: false,
    });
    const afterSecond = await store.listTrades({ limit: 5000 });
    for (const id of ids) {
      assert.ok(afterSecond.some((t) => t.id === id), `expected id ${id} to survive second append replay`);
    }
    assert.equal(resets.count, 0);
    assert.equal(LIVE_SWITCH, false);
  });

  it('replay with --reset rebuilds the journal', async () => {
    const config = loadConfig({ PAPER_CASH: '100', DAYTRADE_UNIVERSE: 'SOFI,PLTR' });
    const store = createMemoryStore();
    const barsClient = createBarsClient({ env: {} });
    const seeded = await seedKeepTrade(store);
    const result = await runReplay({
      store,
      barsClient,
      config,
      days: 8,
      persist: true,
      reset: true,
    });
    const trades = await store.listTrades({ limit: 5000 });
    assert.equal(result.reset, true);
    assert.equal(trades.some((t) => t.id === seeded.id), false);
    assert.equal(result.liveEnabled, false);
  });

  it('replay with longer lookback stores more candle_bars', async () => {
    const config = loadConfig({ PAPER_CASH: '100', DAYTRADE_UNIVERSE: 'SOFI,PLTR' });
    const store = createMemoryStore();
    const barsClient = createBarsClient({ env: {} });
    await runReplay({
      store,
      barsClient,
      config,
      days: 8,
      persist: true,
      reset: false,
    });
    const shorter = await store.candleStats();
    await runReplay({
      store,
      barsClient,
      config,
      days: 24,
      persist: true,
      reset: false,
    });
    const longer = await store.candleStats();
    assert.ok(shorter.bars > 0, 'expected candles after short lookback');
    assert.ok(longer.bars > shorter.bars, `expected more bars after 24d than 8d (got ${longer.bars} vs ${shorter.bars})`);
    assert.equal(LIVE_SWITCH, false);
  });

  it('defaults Alpaca historical lookback to DEFAULT_REPLAY_DAYS and does not reset', async () => {
    const config = loadConfig({ PAPER_CASH: '100', DAYTRADE_UNIVERSE: 'SOFI,PLTR' });
    const store = createMemoryStore();
    const inner = createBarsClient({ env: {} });
    let requested;
    const barsClient = {
      async loadBars(symbols, opts = {}) {
        requested = opts.days;
        return inner.loadBars(symbols, { days: 5 });
      },
    };
    const resets = wrapResetCounter(store);
    const result = await runReplay({
      store,
      barsClient,
      config,
      persist: true,
    });
    assert.equal(requested, DEFAULT_REPLAY_DAYS);
    assert.equal(result.lookbackDays, DEFAULT_REPLAY_DAYS);
    assert.equal(result.reset, false);
    assert.equal(result.liveEnabled, false);
    assert.equal(resets.count, 0);
    assert.ok(DEFAULT_REPLAY_DAYS > 20);
  });
});
