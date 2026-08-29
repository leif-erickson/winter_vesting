'use strict';

const { FROZEN_ANOMALY_WINDOWS } = require('./regime');
const { assertAmtIsNotAFacet, schoolSnapshot } = require('./schools');
const { boardSnapshot } = require('./researchBoard');

const MAX_FACETS = 5;

const NAMED_EDGE = 'Stock auction: 15m opening range + VWAP fair value + relative volume on high-beta names; flatten by close. AMT labels: initial_balance / value / participation. Not AI narrative, not Gann, not a 12-factor score.';

const HIGH_BETA = ['SOFI', 'PLTR', 'TSLA', 'ARKK', 'NVDA', 'QQQ'];
const SLOW_LARGE_CAP = ['MSFT', 'AMZN', 'BRK.B'];

const DEFAULT_UNIVERSE = ['SOFI', 'BRK.B', 'TSLA', 'AMZN', 'ARKK', 'MSFT', 'NVDA', 'PLTR'];

const SETUPS = [
  {
    id: 'orb_breakout',
    name: 'Opening-range breakout',
    description: '15-minute RTH opening-range breakout, close above OR high, above VWAP, with relative volume.',
    facets: ['or_break', 'above_vwap', 'rvol'],
    assetClass: 'stocks',
    family: 'auction',
  },
  {
    id: 'vwap_rsi_reversion',
    name: 'VWAP + RSI reclaim',
    description: 'RSI oversold, price reclaims session VWAP on relative volume.',
    facets: ['vwap_reclaim', 'rsi', 'rvol'],
    assetClass: 'stocks',
    family: 'mean_reversion',
  },
  {
    id: 'orb_retest',
    name: 'Opening-range retest',
    description: 'After an OR breakout, pullback to OR midpoint / VWAP and close back in the breakout direction.',
    facets: ['prior_or_break', 'mid_vwap_touch', 'rvol'],
    assetClass: 'stocks',
    family: 'auction',
  },
  {
    id: 'bar_reversal',
    name: 'Bar reversal at VWAP',
    description: 'Bullish pin or engulf at/above VWAP with relative volume. Intraday only.',
    facets: ['pin_or_engulf', 'at_vwap', 'rvol'],
    assetClass: 'stocks',
    family: 'reversal',
  },
  {
    id: 'impulse_hold',
    name: 'Impulse hold (expansion only)',
    description: 'Continuation while VWAP holds after an OR/structure break. Fires only in expansion regime.',
    facets: ['or_or_structure_break', 'above_vwap', 'rvol'],
    assetClass: 'stocks',
    family: 'vol_expansion',
    regimes: ['expansion'],
  },
  {
    id: 'roundtrip_fade',
    name: 'Round-trip fade (reset only)',
    description: 'Fade extension after a labeled reset. Signal only; cash book does not short.',
    facets: ['extension_from_high', 'vwap_loss_or_engulf', 'rvol'],
    assetClass: 'stocks',
    family: 'vol_reset',
    regimes: ['reset'],
  },
];

const ASSET_BOOKS = {
  stocks: {
    venue: 'alpaca_paper',
    live: 'robinhood_mcp_confirm',
    notes: '$100 cash, no options, flatten-by-close',
  },
  crypto: {
    venue: 'ccxt_paper',
    live: 'never_this_repo',
    notes: 'Weekend/24h book: TIA Gann D/W on BTC/ETH, ccxt_paper. Live RH crypto never from this repo.',
  },
  futures: {
    venue: 'rithmic_stub',
    live: 'wstrat_candlemaster',
    notes: 'Globex Sunday 4:00 PM MT open. NQ/ES AMT later (nq_es_auction inbox). CL/PL Tori 4h. NT out. Fills not live.',
  },
  options: {
    venue: 'research_note',
    live: 'not_on_100_cash_rh',
    notes: 'Defined-risk IV hypothesis; no fill engine this pass',
  },
};

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

function setupIdsForSymbol(symbol, setups = SETUPS) {
  const id = String(symbol || '').toUpperCase();
  const slow = new Set(SLOW_LARGE_CAP);
  if (slow.has(id)) {
    return setups
      .filter((s) => ['vwap_rsi_reversion', 'bar_reversal', 'impulse_hold', 'roundtrip_fade'].includes(s.id))
      .map((s) => s.id);
  }
  return setups
    .filter((s) => ['orb_breakout', 'orb_retest', 'bar_reversal', 'impulse_hold', 'roundtrip_fade'].includes(s.id))
    .map((s) => s.id);
}

function assertFacetBudget(setups, max = MAX_FACETS) {
  for (const s of setups || []) {
    const n = (s.facets || []).length;
    if (n < 2 || n > max) {
      throw new Error(`setup ${s.id} must declare 2–${max} facets`);
    }
  }
  assertAmtIsNotAFacet(setups);
}

function edgeSnapshot(config) {
  const cfg = config || loadConfig();
  const schools = cfg.schools || schoolSnapshot(cfg.setups);
  const board = boardSnapshot({ ideas: cfg.ideas || [], setups: cfg.setups });
  return {
    namedEdge: cfg.namedEdge,
    maxFacets: cfg.maxFacets,
    setups: (cfg.setups || []).map((s) => ({
      id: s.id,
      name: s.name,
      family: s.family || null,
      facets: s.facets || [],
      amt: (schools.amt?.bySetup || {})[s.id] || {},
      assetClass: s.assetClass || 'stocks',
      regimes: s.regimes || null,
    })),
    schools,
    assetBooks: cfg.assetBooks,
    frozenWindows: cfg.frozenWindows,
    weekly: 'npm run paper:weekly writes backend/reports/weekly.md — named edge, OOS, regime mix, anomaly flags, one experiment slot',
    researchBoard: 'GET /research/board — books matrix, session clocks, next-to-explore (status queue), and OOS vs journal honesty. Never a fake setup ranking. Never live-eligible from this.',
    honesty: board.honesty,
    nextToExplore: board.nextToExplore,
    experimentSlot: board.experimentSlot,
    schoolBooks: board.schoolBooks,
    nextActions: board.nextActions,
    liveEligibleFromBoard: false,
  };
}

function loadConfig(env = process.env) {
  const startingCash = Number(env.PAPER_CASH || 100);
  const setups = SETUPS.map((s) => ({ ...s }));
  assertFacetBudget(setups);
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
    setups,
    maxFacets: MAX_FACETS,
    namedEdge: NAMED_EDGE,
    schools: schoolSnapshot(setups),
    assetBooks: ASSET_BOOKS,
    frozenWindows: FROZEN_ANOMALY_WINDOWS,
    variantsTried: Number(env.VARIANTS_TRIED || setups.length),
    goalDoubleDays: Math.max(1, Number(env.GOAL_DOUBLE_DAYS || 365)),
  };
}

module.exports = {
  DEFAULT_UNIVERSE,
  SETUPS,
  PROMOTION_GATES,
  MAX_FACETS,
  NAMED_EDGE,
  HIGH_BETA,
  SLOW_LARGE_CAP,
  ASSET_BOOKS,
  loadConfig,
  parseUniverse,
  setupIdsForSymbol,
  assertFacetBudget,
  edgeSnapshot,
};
