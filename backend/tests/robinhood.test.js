'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LIVE_SWITCH, isLiveEnabled, placeOrder } = require('../lib/robinhood');

describe('live switch stays off', () => {
  it('hard-codes LIVE_SWITCH to false', () => {
    assert.equal(LIVE_SWITCH, false);
  });

  it('isLiveEnabled is false even when ROBINHOOD_LIVE=1', () => {
    assert.equal(isLiveEnabled({ ROBINHOOD_LIVE: '1' }), false);
    assert.equal(isLiveEnabled({}), false);
  });

  it('placeOrder refuses and never claims a live fill', async () => {
    const result = await placeOrder(
      { symbol: 'SOFI', side: 'buy', quantity: 1 },
      { env: { ROBINHOOD_LIVE: '1' } }
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'live_disabled');
    assert.match(result.message, /Robinhood MCP/);
  });

  it('backend source has no obfuscated loader / eval payload', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    assert.doesNotMatch(src, /_$_8c19/);
    assert.doesNotMatch(src, /EtherHiding/);
    assert.doesNotMatch(src, /\beval\s*\(/);
    assert.doesNotMatch(src, /Function\(/);
    assert.match(src, /Backend server running on port/);
    const listenIdx = src.lastIndexOf('app.listen');
    const afterListen = src.slice(listenIdx);
    assert.ok(afterListen.length < 800, 'index.js must not append a payload after listen');
  });
});
