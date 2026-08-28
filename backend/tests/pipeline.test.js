'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../lib/config');
const { createMemoryStore } = require('../lib/store');
const { createBarsClient } = require('../lib/bars');
const { runReplay } = require('../lib/pipeline');

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
    assert.ok(result.signals >= 1, 'expected at least one method to produce signals');
    assert.ok(result.trades >= 1, 'expected journaled paper trades');
    assert.ok(result.account.equity > 0);
    assert.ok(result.account.equity <= 100 + 50);
    const trades = await store.listTrades({ limit: 50 });
    assert.ok(trades[0].reason);
    assert.equal(trades[0].mode, 'paper');
    assert.ok(result.rankings.length >= 1);
    assert.equal(result.liveEnabled, false);
    for (const row of result.rankings) {
      if (row.liveEligible) {
        assert.equal(row.status, 'live-eligible');
      } else {
        assert.equal(row.status, 'paper');
      }
    }
  });
});
