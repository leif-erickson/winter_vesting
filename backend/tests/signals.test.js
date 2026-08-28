'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../lib/config');
const { signalsForSymbol } = require('../lib/signals');

function makeBar({ symbol = 'SOFI', sessionDate = '2024-03-04', i, open, high, low, close, volume }) {
  const minuteOfDay = 9 * 60 + 30 + i * 5;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    symbol,
    sessionDate,
    minuteOfDay,
    ts: `${sessionDate}T${pad(hour)}:${pad(minute)}:00-04:00`,
    open,
    high,
    low,
    close,
    volume,
  };
}

function session({ date, start, volumes, closes }) {
  return closes.map((close, i) => {
    const open = i === 0 ? start : closes[i - 1];
    const high = Math.max(open, close) + 0.02;
    const low = Math.min(open, close) - 0.02;
    return makeBar({
      sessionDate: date,
      i,
      open,
      high,
      low,
      close,
      volume: volumes[i] ?? 1000,
    });
  });
}

describe('signals', () => {
  const config = loadConfig();

  it('fires orb_breakout after a 15-minute range with VWAP + rvol confirmation', () => {
    const prior = session({
      date: '2024-03-01',
      start: 10,
      closes: Array.from({ length: 20 }, () => 10),
      volumes: Array.from({ length: 20 }, () => 1000),
    });
    const todayCloses = [10, 10.05, 10.02, 10.4, 10.45];
    const today = session({
      date: '2024-03-04',
      start: 10,
      closes: todayCloses,
      volumes: [1000, 1000, 1000, 3000, 2000],
    });
    const { signals } = signalsForSymbol(today, { priorSessions: [prior], config });
    const hit = signals.find((s) => s.setupId === 'orb_breakout');
    assert.ok(hit, `expected orb_breakout, got ${signals.map((s) => s.setupId).join(',') || 'none'}`);
    assert.equal(hit.side, 'BUY');
    assert.equal(hit.symbol, 'SOFI');
    assert.match(hit.reason, /OR breakout/i);
    assert.ok(hit.features.rvol >= 1.2);
  });

  it('fires vwap_rsi_reversion when an oversold session reclaims VWAP', () => {
    const prior = session({
      date: '2024-03-01',
      start: 20,
      closes: Array.from({ length: 40 }, () => 20),
      volumes: Array.from({ length: 40 }, () => 1000),
    });
    const dump = Array.from({ length: 16 }, (_, i) => 20 - i * 0.6);
    dump.push(16.8);
    dump.push(17.4);
    const today = session({
      date: '2024-03-04',
      start: 20,
      closes: dump,
      volumes: dump.map((_, i) => (i >= 16 ? 2500 : 1200)),
    });
    const { signals } = signalsForSymbol(today, { priorSessions: [prior], config });
    const hit = signals.find((s) => s.setupId === 'vwap_rsi_reversion');
    assert.ok(hit, `expected vwap_rsi_reversion, got ${signals.map((s) => s.setupId).join(',') || 'none'}`);
    assert.match(hit.reason, /VWAP reclaim/i);
  });

  it('fires orb_retest after a breakout pullback to the OR midpoint', () => {
    const prior = session({
      date: '2024-03-01',
      start: 10,
      closes: Array.from({ length: 20 }, () => 10),
      volumes: Array.from({ length: 20 }, () => 1000),
    });
    // OR ~10.0-10.1, breakout at bar 3, pullback to mid ~10.05, resume.
    const closes = [10.0, 10.08, 10.04, 10.25, 10.22, 10.12, 10.18];
    const today = session({
      date: '2024-03-04',
      start: 10,
      closes,
      volumes: [1000, 1000, 1000, 2500, 1200, 1800, 2000],
    });
    // Force the pullback bar low through OR mid via a direct tweak.
    today[5].low = 10.02;
    today[5].close = 10.18;
    today[5].open = 10.08;
    today[6].open = 10.18;
    const { signals } = signalsForSymbol(today, { priorSessions: [prior], config });
    const hit = signals.find((s) => s.setupId === 'orb_retest');
    assert.ok(hit, `expected orb_retest, got ${signals.map((s) => s.setupId).join(',') || 'none'}`);
    assert.match(hit.reason, /OR retest/i);
  });
});
