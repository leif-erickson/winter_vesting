'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createRithmicAdapter, SUBMIT_ERROR } = require('../lib/rithmic');

describe('Rithmic adapter stub', () => {
  it('reports configured=false, live=false, dryRun=true without credentials', () => {
    const adapter = createRithmicAdapter({ env: {} });
    const status = adapter.status();
    assert.equal(status.configured, false);
    assert.equal(status.live, false);
    assert.equal(status.dryRun, true);
    assert.equal(status.venue, 'rithmic');
    assert.equal(status.systemName, 'Rithmic Test');
    assert.equal(status.appName, 'stock_market');
    assert.equal(status.url, 'rituz00100.rithmic.com:443');
    assert.match(status.note, /NinjaTrader is not a routing path/);
    assert.match(status.note, /wstrat_candlemaster/);
  });

  it('marks configured when user and password are present but still not live', () => {
    const adapter = createRithmicAdapter({
      env: {
        RITHMIC_USER: 'demo',
        RITHMIC_PASSWORD: 'demo',
        RITHMIC_SYSTEM_NAME: 'Rithmic Paper Trading',
      },
    });
    const status = adapter.status();
    assert.equal(status.configured, true);
    assert.equal(status.live, false);
    assert.equal(status.dryRun, true);
    assert.equal(status.systemName, 'Rithmic Paper Trading');
  });

  it('submitOrder always throws and never places', async () => {
    const adapter = createRithmicAdapter({
      env: { RITHMIC_USER: 'demo', RITHMIC_PASSWORD: 'demo' },
    });
    await assert.rejects(
      () => adapter.submitOrder({ symbol: 'ESU6', side: 'buy', qty: 1 }),
      (err) => {
        assert.equal(err.message, SUBMIT_ERROR);
        assert.match(err.message, /Rithmic live is not enabled/);
        assert.match(err.message, /NinjaTrader is not a routing path/);
        return true;
      }
    );
  });
});
