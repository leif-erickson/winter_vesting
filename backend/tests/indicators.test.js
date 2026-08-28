'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rsi, sessionVwap, openingRange, relativeVolume } = require('../lib/indicators');

describe('indicators', () => {
  it('computes Wilder RSI that is high after a straight run-up', () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const series = rsi(closes, 14);
    assert.equal(series[13], null);
    assert.ok(series[14] > 70);
    assert.ok(series[15] > 70);
  });

  it('computes Wilder RSI that is low after a straight selloff', () => {
    const closes = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    const series = rsi(closes, 14);
    assert.ok(series[15] < 30);
  });

  it('session VWAP weights typical price by volume', () => {
    const bars = [
      { high: 11, low: 9, close: 10, volume: 100 },
      { high: 12, low: 10, close: 11, volume: 300 },
    ];
    const vwap = sessionVwap(bars);
    const tp0 = (11 + 9 + 10) / 3;
    const tp1 = (12 + 10 + 11) / 3;
    assert.equal(vwap[0], tp0);
    assert.equal(vwap[1], (tp0 * 100 + tp1 * 300) / 400);
  });

  it('opening range uses the first N bars only', () => {
    const bars = [
      { high: 10.2, low: 9.8 },
      { high: 10.4, low: 9.9 },
      { high: 10.1, low: 9.7 },
      { high: 11.0, low: 10.5 },
    ];
    const or = openingRange(bars, 3);
    assert.equal(or.high, 10.4);
    assert.equal(or.low, 9.7);
  });

  it('relative volume is volume / mean of prior same-time bars', () => {
    assert.equal(relativeVolume(200, [100, 100]), 2);
    assert.equal(relativeVolume(50, []), 1);
  });
});
