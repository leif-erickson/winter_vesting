'use strict';

const DEFAULT_UNIVERSE = ['SOFI', 'BRK.B', 'TSLA', 'AMZN', 'ARKK', 'MSFT', 'NVDA', 'PLTR'];

const SETUPS = [
  {
    id: 'orb_breakout',
    name: 'Opening-range breakout',
    description: '15-minute RTH opening-range breakout, close above OR high, above VWAP, with relative volume.',
  },
  {
    id: 'vwap_rsi_reversion',
    name: 'VWAP + RSI reclaim',
    description: 'RSI oversold, price reclaims session VWAP on relative volume.',
  },
  {
    id: 'orb_retest',
    name: 'Opening-range retest',
    description: 'After an OR breakout, pullback to OR midpoint / VWAP and close back in the breakout direction.',
  },
];

const PROMOTION_GATES = {
  minOosTrades: 8,
  minWinRate: 0.45,
  minOosPnl: 0,
  minConsistency: 0.5,
  maxDrawdown: 20,
};

function parseUniverse(raw) {
  if (!raw) return [...DEFAULT_UNIVERSE];
  return raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
}

function loadConfig(env = process.env) {
  const startingCash = Number(env.PAPER_CASH || 100);
  return {
    universe: parseUniverse(env.DAYTRADE_UNIVERSE),
    startingCash,
    maxPositionPct: Number(env.MAX_POSITION_PCT || 0.25),
    maxDailyLoss: Number(env.MAX_DAILY_LOSS || startingCash * 0.08),
    maxEntriesPerDay: Number(env.MAX_ENTRIES_PER_DAY || 4),
    maxOpenPositions: 1,
    barMinutes: 5,
    orBars: 3,
    rsiPeriod: 14,
    rvolLookbackSessions: 5,
    rvolMin: 1.2,
    lastEntryMinute: 15 * 60 + 30,
    flattenMinute: 15 * 60 + 50,
    rthStartMinute: 9 * 60 + 30,
    rthEndMinute: 16 * 60,
    promotion: { ...PROMOTION_GATES },
    setups: SETUPS,
  };
}

module.exports = {
  DEFAULT_UNIVERSE,
  SETUPS,
  PROMOTION_GATES,
  loadConfig,
  parseUniverse,
};
