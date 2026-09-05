'use strict';

const { Session } = require('./candle');
const { openingRange } = require('./indicators');
const { isAuctionSkipDay, skipReason } = require('./newsSkip');
const { regimeForDate } = require('./regime');

/**
 * Separate equities book: 30-minute opening range, 5-minute entries.
 * Not a facet on stock_auction_5m (no VWAP / rvol confirms).
 * Idea id 8 on the leif research journal. Paper only.
 */

const ORB30_BOOK_ID = 'stock_orb30_5m';
const ORB30_IDEA_ID = 8;
const ORB30_OR_BARS = 6;
const LUNCH_START_MINUTE = 11 * 60 + 30;
const LUNCH_END_MINUTE = 13 * 60 + 30;
const FIB_STOP_RATIO = 0.618;

const ORB30_FACETS = ['or30_break', 'session_window', 'structure_stop'];

const ORB30_R_TARGETS = [1, 2, 3];
const ORB30_SL_MODES = ['sr', 'fib'];

const ORB30_SETUPS = ORB30_SL_MODES.flatMap((slMode) => (
  ORB30_R_TARGETS.map((rMultiple) => ({
    id: `orb30_${slMode}_${rMultiple}r`,
    name: `30m ORB ${slMode.toUpperCase()} ${rMultiple}R`,
    description: `30-minute cash OR, 5m break, ${slMode} stop, ${rMultiple}R target. Flatten by close. Not stacked on 15m OR+VWAP+rvol.`,
    facets: [...ORB30_FACETS],
    assetClass: 'stocks',
    family: 'orb30',
    book: ORB30_BOOK_ID,
    slMode,
    rMultiple,
    liveEligible: false,
  }))
));

const ORB30_BOOK = {
  id: ORB30_BOOK_ID,
  school: 'amt',
  schoolBook: 'amt',
  kind: 'mechanical',
  instrumentFamily: 'winter_watchlist',
  timeframe: '5m',
  venue: 'alpaca_paper',
  status: 'paper',
  newsOverlay: 'skip_nfp_cpi_fomc',
  nextAction: 'run_wf',
  ideaId: ORB30_IDEA_ID,
  liveEligible: false,
  note: 'Separate 30m-OR / 5m book on the Winter watchlist. Lunch blackout 11:30–13:30 ET. Skip NFP/CPI/FOMC. Flatten by close. Few entries/day. Not a facet on stock_auction_5m. Idea 8. Paper only.',
};

function inLunchBlackout(minuteOfDay) {
  const m = Number(minuteOfDay);
  return Number.isFinite(m) && m >= LUNCH_START_MINUTE && m < LUNCH_END_MINUTE;
}

function or30Locked(bar, orBars = ORB30_OR_BARS) {
  if (bar?.orLocked && bar.orBars === orBars) return true;
  return Boolean(bar?.orLocked && (bar.index == null || bar.index >= orBars));
}

function canOpenOrb30(bar, { lastEntryMinute = 15 * 60 + 30 } = {}) {
  if (!bar) return false;
  if (isAuctionSkipDay(bar.sessionDate)) return false;
  if (inLunchBlackout(bar.minuteOfDay)) return false;
  if (!(bar.minuteOfDay <= lastEntryMinute)) return false;
  if (!or30Locked(bar)) return false;
  return true;
}

function flattenPrior(priorSessions) {
  const out = [];
  for (const session of priorSessions || []) {
    if (Array.isArray(session)) out.push(...session);
    else if (session?.candles) out.push(...session.candles);
  }
  return out;
}

function annotateOrb30Session(sessionBars, { priorSessions = [], config = {}, regime, assetClass = 'stocks' } = {}) {
  const date = sessionBars[0]?.sessionDate;
  const labeled = regime || regimeForDate(date, {
    bars: [...flattenPrior(priorSessions), ...sessionBars],
    windows: config.frozenWindows,
  });
  const bookConfig = {
    ...config,
    orBars: ORB30_OR_BARS,
  };
  const annotated = Session.fromBars(sessionBars, {
    config: bookConfig,
    priorSessions,
    regime: labeled,
    assetClass,
  }).toAnnotated();
  return annotated.map((bar) => ({
    ...bar,
    orBars: ORB30_OR_BARS,
    book: ORB30_BOOK_ID,
    lunchBlackout: inLunchBlackout(bar.minuteOfDay),
  }));
}

function morningImpulse(annotated, index) {
  const bars = (annotated || []).slice(0, Math.max(index, ORB30_OR_BARS) + 1);
  if (!bars.length) return { high: null, low: null };
  const or = openingRange(bars, ORB30_OR_BARS);
  const after = bars.slice(ORB30_OR_BARS);
  const highs = [or.high, ...after.map((b) => b.high)].filter((n) => Number.isFinite(n));
  const lows = [or.low, ...after.map((b) => b.low)].filter((n) => Number.isFinite(n));
  return {
    high: highs.length ? Math.max(...highs) : or.high,
    low: lows.length ? Math.min(...lows) : or.low,
    orHigh: or.high,
    orLow: or.low,
  };
}

function nearbySupports(bar, annotated, index) {
  const impulse = morningImpulse(annotated, index);
  const swings = [];
  const lookback = (annotated || []).slice(0, index + 1);
  for (let i = 2; i < lookback.length; i += 1) {
    const prev = lookback[i - 1];
    const cur = lookback[i];
    const nxt = lookback[i + 1];
    if (!nxt) continue;
    if (cur.low <= prev.low && cur.low <= nxt.low) swings.push(cur.low);
  }
  return [
    bar.orLow,
    bar.swingLow,
    impulse.low,
    impulse.orLow,
    ...swings,
  ].filter((n) => Number.isFinite(Number(n))).map(Number);
}

/**
 * Nearby support: highest structural low strictly below entry
 * (OR low, morning-impulse low, last swing low).
 */
function srStop(bar, annotated, index) {
  const entry = Number(bar.close);
  const supports = nearbySupports(bar, annotated, index).filter((px) => px < entry);
  if (!supports.length) return Number.isFinite(Number(bar.orLow)) ? Number(bar.orLow) : null;
  return Math.max(...supports);
}

/**
 * Fibonacci stop of the OR or morning impulse: 61.8% retracement
 * from the impulse high. Typically tighter than the OR low.
 */
function fibStop(bar, annotated, index) {
  const impulse = morningImpulse(annotated, index);
  const high = Number(impulse.high);
  const low = Number(impulse.low);
  if (!(high > low)) return srStop(bar, annotated, index);
  return high - FIB_STOP_RATIO * (high - low);
}

function structureStop(bar, annotated, index, slMode) {
  if (slMode === 'fib') return fibStop(bar, annotated, index);
  return srStop(bar, annotated, index);
}

function orb30Break(bar, prev) {
  if (!prev) return false;
  if (!(Number(bar.orHigh) > 0)) return false;
  return bar.close > bar.orHigh && prev.close <= bar.orHigh;
}

function featuresFor(bar, variant) {
  return {
    close: bar.close,
    sessionDate: bar.sessionDate,
    minuteOfDay: bar.minuteOfDay,
    regime: bar.regime || 'quiet',
    assetClass: bar.assetClass || 'stocks',
    book: ORB30_BOOK_ID,
    ideaId: ORB30_IDEA_ID,
    slMode: variant.slMode,
    rMultiple: variant.rMultiple,
    orHigh: bar.orHigh,
    orLow: bar.orLow,
    orBars: ORB30_OR_BARS,
    lunchBlackout: false,
    facets: [...ORB30_FACETS],
    liveEligible: false,
  };
}

function detectOrb30(bar, prev, annotated, index, variant) {
  if (!canOpenOrb30(bar)) return null;
  if (!orb30Break(bar, prev)) return null;
  const stop = structureStop(bar, annotated, index, variant.slMode);
  const entry = Number(bar.close);
  if (!(Number.isFinite(stop) && entry > stop)) return null;
  const risk = entry - stop;
  const target = entry + Number(variant.rMultiple) * risk;
  return {
    setupId: variant.id,
    side: 'BUY',
    stop,
    target,
    reason: `30m OR break: close ${entry.toFixed(2)} > ORH ${Number(bar.orHigh).toFixed(2)}, sl=${variant.slMode} stop ${stop.toFixed(2)}, ${variant.rMultiple}R`,
    features: featuresFor(bar, variant),
  };
}

function evaluateOrb30(annotated, variant) {
  const signals = [];
  const fired = new Set();
  for (let i = 1; i < annotated.length; i += 1) {
    const bar = annotated[i];
    const prev = annotated[i - 1];
    const key = `${variant.id}:${bar.sessionDate}:${bar.symbol}`;
    if (fired.has(key)) continue;
    const hit = detectOrb30(bar, prev, annotated, i, variant);
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
      features: hit.features,
      reason: hit.reason,
      assetClass: bar.assetClass || 'stocks',
      family: 'orb30',
      book: ORB30_BOOK_ID,
    });
  }
  return signals;
}

function signalsForOrb30(bars, { priorSessions = [], config, variant, regime, assetClass } = {}) {
  if (isAuctionSkipDay(bars[0]?.sessionDate)) {
    return { annotated: [], signals: [], skipped: skipReason(bars[0]?.sessionDate) };
  }
  const annotated = annotateOrb30Session(bars, { priorSessions, config, regime, assetClass });
  return {
    annotated,
    signals: evaluateOrb30(annotated, variant),
    skipped: null,
  };
}

function orb30ConfigOverlay(base = {}) {
  return {
    ...base,
    orBars: ORB30_OR_BARS,
    maxEntriesPerDay: 1,
    maxOpenPositions: 1,
    skipMacroDays: true,
    lastEntryMinute: 15 * 60 + 30,
    flattenMinute: 15 * 60 + 50,
    rthStartMinute: 9 * 60 + 30,
    rthEndMinute: 16 * 60,
    book: ORB30_BOOK_ID,
    setups: ORB30_SETUPS.map((s) => ({ ...s })),
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function weekdayIso(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Deterministic 5m RTH tape for this book only. Does not replace the
 * named-edge synthetic generator (that one is biased to a 15m OR).
 */
function generateOrb30SessionBars(symbol, sessionDate, { start = 20, scenario = 'breakout' } = {}) {
  const bars = [];
  let px = start;
  const orHigh = start + 0.12;
  const orLow = start - 0.08;
  for (let i = 0; i < 78; i += 1) {
    const minuteOfDay = 9 * 60 + 30 + i * 5;
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    let open = px;
    let close = px;
    let high = px;
    let low = px;
    let volume = 1000;
    if (i < ORB30_OR_BARS) {
      const up = i % 2 === 0;
      close = up ? start + 0.04 : start - 0.03;
      high = up ? orHigh : close + 0.01;
      low = up ? close - 0.01 : orLow;
      px = close;
    } else if (scenario === 'breakout' && i === 8) {
      open = px;
      close = orHigh + 0.08;
      high = close + 0.02;
      low = open - 0.01;
      volume = 2800;
      px = close;
    } else if (scenario === 'breakout' && i > 8 && i < 20) {
      close = px + 0.05;
      high = close + 0.01;
      low = Math.min(open, close) - 0.01;
      volume = 1600;
      px = close;
    } else if (scenario === 'chop') {
      close = start + ((i % 3) - 1) * 0.02;
      high = Math.max(open, close) + 0.01;
      low = Math.min(open, close) - 0.01;
      px = close;
    } else {
      close = px + ((i % 5) - 2) * 0.01;
      high = Math.max(open, close) + 0.01;
      low = Math.min(open, close) - 0.01;
      px = close;
    }
    bars.push({
      symbol,
      sessionDate,
      minuteOfDay,
      ts: `${sessionDate}T${pad(hour)}:${pad(minute)}:00-04:00`,
      open,
      high,
      low,
      close,
      volume,
      synthetic: true,
    });
  }
  return bars;
}

function generateOrb30Universe(symbols, { sessions = 40, startDate = '2026-06-01' } = {}) {
  const bySymbol = {};
  for (const symbol of symbols) bySymbol[symbol] = [];
  let date = startDate;
  let made = 0;
  let guard = 0;
  while (made < sessions && guard < sessions * 4) {
    guard += 1;
    if (!weekdayIso(date)) {
      date = addDays(date, 1);
      continue;
    }
    const scenario = isAuctionSkipDay(date)
      ? 'chop'
      : (made % 3 === 2 ? 'chop' : 'breakout');
    for (const symbol of symbols) {
      const base = 10 + (symbol.charCodeAt(0) % 7);
      bySymbol[symbol].push(...generateOrb30SessionBars(symbol, date, { start: base, scenario }));
    }
    made += 1;
    date = addDays(date, 1);
  }
  return bySymbol;
}

module.exports = {
  ORB30_BOOK_ID,
  ORB30_IDEA_ID,
  ORB30_OR_BARS,
  LUNCH_START_MINUTE,
  LUNCH_END_MINUTE,
  FIB_STOP_RATIO,
  ORB30_FACETS,
  ORB30_R_TARGETS,
  ORB30_SL_MODES,
  ORB30_SETUPS,
  ORB30_BOOK,
  inLunchBlackout,
  canOpenOrb30,
  annotateOrb30Session,
  morningImpulse,
  srStop,
  fibStop,
  structureStop,
  detectOrb30,
  evaluateOrb30,
  signalsForOrb30,
  orb30ConfigOverlay,
  generateOrb30SessionBars,
  generateOrb30Universe,
};
