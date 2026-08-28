'use strict';

const { rsi, sessionVwap, openingRange, relativeVolume } = require('./indicators');

function isRth(bar, config) {
  return bar.minuteOfDay >= config.rthStartMinute && bar.minuteOfDay < config.rthEndMinute;
}

function groupBySession(bars) {
  const map = new Map();
  for (const bar of bars) {
    if (!map.has(bar.sessionDate)) map.set(bar.sessionDate, []);
    map.get(bar.sessionDate).push(bar);
  }
  for (const [, sessionBars] of map) {
    sessionBars.sort((a, b) => a.minuteOfDay - b.minuteOfDay);
  }
  return map;
}

function priorVolumesAtMinute(priorSessions, minuteOfDay) {
  const vols = [];
  for (const session of priorSessions) {
    const match = session.find((b) => b.minuteOfDay === minuteOfDay);
    if (match) vols.push(match.volume);
  }
  return vols;
}

function annotateSession(sessionBars, { priorSessions = [], config }) {
  const rth = sessionBars.filter((b) => isRth(b, config));
  const closes = rth.map((b) => b.close);
  const rsiSeries = rsi(closes, config.rsiPeriod);
  const vwapSeries = sessionVwap(rth);
  const or = openingRange(rth, config.orBars);
  let brokeUp = false;
  let brokeDown = false;

  return rth.map((bar, i) => {
    const rvol = relativeVolume(
      bar.volume,
      priorVolumesAtMinute(priorSessions, bar.minuteOfDay)
    );
    const orLocked = i >= config.orBars;
    if (orLocked && bar.close > or.high) brokeUp = true;
    if (orLocked && bar.close < or.low) brokeDown = true;
    return {
      ...bar,
      rsi: rsiSeries[i],
      vwap: vwapSeries[i],
      orHigh: or.high,
      orLow: or.low,
      orMid: or.high != null && or.low != null ? (or.high + or.low) / 2 : null,
      orLocked,
      rvol,
      brokeUp,
      brokeDown,
      index: i,
    };
  });
}

function stillTakingEntries(bar) {
  return bar.orLocked && bar.minuteOfDay <= 15 * 60 + 30;
}

function orbBreakout(bar, prev) {
  if (!stillTakingEntries(bar) || !prev) return null;
  const crossed = bar.close > bar.orHigh && prev.close <= bar.orHigh;
  if (!crossed) return null;
  if (!(bar.close > bar.vwap)) return null;
  if (bar.rvol < 1.2) return null;
  return {
    setupId: 'orb_breakout',
    side: 'BUY',
    reason: `OR breakout: close ${bar.close.toFixed(2)} > ORH ${bar.orHigh.toFixed(2)}, above VWAP ${bar.vwap.toFixed(2)}, rvol ${bar.rvol.toFixed(2)}`,
    stop: bar.orLow,
    target: bar.close + 1.5 * (bar.close - bar.orLow),
  };
}

function vwapRsiReversion(bar, prev) {
  if (!stillTakingEntries(bar) || !prev) return null;
  if (bar.rsi == null || prev.rsi == null) return null;
  const reclaimed = prev.close <= prev.vwap && bar.close > bar.vwap;
  if (!reclaimed) return null;
  if (!(bar.rsi <= 40 || prev.rsi <= 35)) return null;
  if (bar.rvol < 1.1) return null;
  const stop = Math.min(bar.low, bar.vwap * 0.99);
  return {
    setupId: 'vwap_rsi_reversion',
    side: 'BUY',
    reason: `VWAP reclaim after RSI ${bar.rsi.toFixed(1)} (prev ${prev.rsi.toFixed(1)}), rvol ${bar.rvol.toFixed(2)}`,
    stop,
    target: bar.close + 1.5 * (bar.close - stop),
  };
}

function orbRetest(bar, prev) {
  if (!stillTakingEntries(bar) || !prev) return null;
  if (!bar.brokeUp) return null;
  const level = bar.orMid != null && bar.vwap != null ? Math.max(bar.orMid, bar.vwap * 0.998) : bar.orMid;
  if (level == null) return null;
  const touched = bar.low <= level;
  const resumed = bar.close > level && bar.close > bar.open;
  if (!(touched && resumed)) return null;
  if (bar.rvol < 1.0) return null;
  if (!(prev.close > bar.orHigh || bar.brokeUp)) return null;
  return {
    setupId: 'orb_retest',
    side: 'BUY',
    reason: `OR retest: pullback to mid/VWAP ${level.toFixed(2)} then close ${bar.close.toFixed(2)}, rvol ${bar.rvol.toFixed(2)}`,
    stop: bar.orLow,
    target: bar.close + 1.5 * (bar.close - bar.orLow),
  };
}

const DETECTORS = {
  orb_breakout: orbBreakout,
  vwap_rsi_reversion: vwapRsiReversion,
  orb_retest: orbRetest,
};

function featuresFrom(bar) {
  return {
    rsi: bar.rsi,
    vwap: bar.vwap,
    rvol: bar.rvol,
    orHigh: bar.orHigh,
    orLow: bar.orLow,
    orMid: bar.orMid,
    close: bar.close,
    volume: bar.volume,
    minuteOfDay: bar.minuteOfDay,
    sessionDate: bar.sessionDate,
  };
}

function evaluateSetups(annotatedBars, setupIds = Object.keys(DETECTORS)) {
  const signals = [];
  const fired = new Set();
  for (let i = 1; i < annotatedBars.length; i += 1) {
    const bar = annotatedBars[i];
    const prev = annotatedBars[i - 1];
    for (const setupId of setupIds) {
      const key = `${setupId}:${bar.sessionDate}:${bar.symbol}`;
      if (fired.has(key)) continue;
      const detector = DETECTORS[setupId];
      if (!detector) continue;
      const hit = detector(bar, prev);
      if (!hit) continue;
      fired.add(key);
      signals.push({
        symbol: bar.symbol,
        ts: bar.ts,
        sessionDate: bar.sessionDate,
        minuteOfDay: bar.minuteOfDay,
        side: hit.side,
        setupId: hit.setupId,
        paperPrice: bar.close,
        stop: hit.stop,
        target: hit.target,
        features: featuresFrom(bar),
        reason: hit.reason,
      });
    }
  }
  return signals;
}

function signalsForSymbol(bars, { priorSessions = [], config, setupIds } = {}) {
  const annotated = annotateSession(bars, { priorSessions, config });
  return {
    annotated,
    signals: evaluateSetups(annotated, setupIds),
  };
}

module.exports = {
  isRth,
  groupBySession,
  annotateSession,
  evaluateSetups,
  signalsForSymbol,
  DETECTORS,
};
