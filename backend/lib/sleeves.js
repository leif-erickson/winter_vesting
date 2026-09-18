'use strict';

/**
 * Erickson Alpaca PAPER capital policy (2026-09-18).
 *
 * Mental book ~400k buying power as four sleeves of ~100k. Alpaca paper is
 * NOT Robinhood Agentic — do not mirror RH $100 sizing or strategy caps.
 * Live Alpaca / Robinhood live stay refused by existing gates.
 */

const SLEEVE_IDS = Object.freeze(['intraday', 'multi_day', 'crypto', 'options']);
const ACTIVE_PAPER_SLEEVE = 'intraday';
const DEFAULT_SLEEVE_EQUITY = 100_000;
const MIN_RISK_PCT = 0.01;
const MAX_RISK_PCT = 0.02;
const DEFAULT_RISK_PCT = 0.01;
const MIN_PLANNED_R = 1;
const MAX_PLANNED_R = 2;
const TOY_ACCOUNT_CEILING = 1000;

const SLEEVE_DEFS = Object.freeze({
  intraday: {
    id: 'intraday',
    label: 'intraday',
    startingEquity: DEFAULT_SLEEVE_EQUITY,
    status: 'active',
    edge: 'named 15m OR+VWAP+rvol; flatten by close',
    venue: 'alpaca_paper',
    notes: 'Active sleeve for paper:daily. Not Robinhood Agentic. Do not mirror RH $100 sizing.',
  },
  multi_day: {
    id: 'multi_day',
    label: 'multi-day',
    startingEquity: DEFAULT_SLEEVE_EQUITY,
    status: 'parked',
    edge: 'swing holds',
    venue: 'alpaca_paper',
    notes: 'Park until a multi-day fill engine is wired. Equity stays mentally convertible at ~100k.',
  },
  crypto: {
    id: 'crypto',
    label: 'crypto',
    startingEquity: DEFAULT_SLEEVE_EQUITY,
    status: 'parked',
    edge: 'Alpaca paper crypto only if the paper account allows it',
    venue: 'alpaca_paper',
    notes: 'Parked: this repo has no Alpaca crypto fill path. Do not assume the paper account allows crypto.',
  },
  options: {
    id: 'options',
    label: 'options',
    startingEquity: DEFAULT_SLEEVE_EQUITY,
    status: 'parked',
    edge: 'Alpaca paper options only if the paper account allows it',
    venue: 'alpaca_paper',
    notes: 'Parked: no options fill engine. Not on the RH $100 cash book.',
  },
});

function parsePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Clamp risk percent into the 1–2% sleeve band. Unset → default 1%.
 * @param {unknown} value
 * @param {{ min?: number, max?: number, fallback?: number }} [opts]
 * @returns {number}
 */
function clampRiskPct(value, {
  min = MIN_RISK_PCT,
  max = MAX_RISK_PCT,
  fallback = DEFAULT_RISK_PCT,
} = {}) {
  if (value == null || String(value).trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function plannedR({ price, stop, target, side = 'buy' } = {}) {
  const px = Number(price);
  const st = Number(stop);
  const tg = Number(target);
  if (!(px > 0) || !(st > 0) || !(tg > 0)) return null;
  const isSell = String(side || 'buy').toUpperCase() === 'SELL';
  const risk = isSell ? (st - px) : (px - st);
  const reward = isSell ? (px - tg) : (tg - px);
  if (!(risk > 0) || !(reward > 0)) return null;
  return reward / risk;
}

function inPlannedRBand(r, { min = MIN_PLANNED_R, max = MAX_PLANNED_R } = {}) {
  if (r == null || !Number.isFinite(r)) return false;
  return r + 1e-9 >= min && r - 1e-9 <= max;
}

function emptySleeveSnapshot(startingEquity = DEFAULT_SLEEVE_EQUITY) {
  return {
    pnl: Object.fromEntries(SLEEVE_IDS.map((id) => [id, 0])),
    counts: Object.fromEntries(SLEEVE_IDS.map((id) => [id, 0])),
    startingEquity,
  };
}

function sleeveOfTrade(trade) {
  const explicit = trade?.features?.sleeve || trade?.sleeve;
  if (explicit && SLEEVE_IDS.includes(explicit)) return explicit;
  const asset = String(trade?.assetClass || trade?.asset_class || trade?.features?.assetClass || '').toLowerCase();
  if (asset === 'crypto') return 'crypto';
  if (asset === 'options') return 'options';
  if (asset === 'futures') return 'multi_day';
  return 'intraday';
}

/**
 * Split realized P&L by sleeve. Parked sleeves stay at 0 until wired.
 * @param {object[]} trades
 * @returns {{ pnl: Record<string, number>, counts: Record<string, number> }}
 */
function splitPnlBySleeve(trades = []) {
  const pnl = Object.fromEntries(SLEEVE_IDS.map((id) => [id, 0]));
  const counts = Object.fromEntries(SLEEVE_IDS.map((id) => [id, 0]));
  for (const trade of trades || []) {
    const id = sleeveOfTrade(trade);
    counts[id] += 1;
    if (trade.pnl == null) continue;
    pnl[id] += Number(trade.pnl || 0);
  }
  return { pnl, counts };
}

function isToyPaperAccount(row, sleeveStart = DEFAULT_SLEEVE_EQUITY) {
  if (!row) return true;
  const start = Number(row.starting_cash ?? row.startingCash);
  if (!Number.isFinite(start) || start <= 0) return true;
  return start < Math.min(TOY_ACCOUNT_CEILING, sleeveStart * 0.25);
}

function loadSleeves(env = process.env) {
  const startingEquity = parsePositiveNumber(env.PAPER_SLEEVE_EQUITY, DEFAULT_SLEEVE_EQUITY);
  const riskPct = clampRiskPct(env.PAPER_SLEEVE_RISK_PCT);
  const requestedActive = String(env.PAPER_ACTIVE_SLEEVE || ACTIVE_PAPER_SLEEVE).trim().toLowerCase().replace('-', '_');
  const activeId = SLEEVE_IDS.includes(requestedActive) ? requestedActive : ACTIVE_PAPER_SLEEVE;

  const sleeves = {};
  for (const id of SLEEVE_IDS) {
    const def = SLEEVE_DEFS[id];
    sleeves[id] = {
      ...def,
      startingEquity,
      status: id === activeId ? 'active' : 'parked',
      riskPct: id === activeId ? riskPct : null,
    };
  }

  // paper:daily is the named 15m auction book. Non-intraday "active" stays parked
  // until those fill engines exist — unused sleeves must remain convertible.
  if (activeId !== ACTIVE_PAPER_SLEEVE) {
    sleeves[activeId].status = 'parked';
    sleeves[ACTIVE_PAPER_SLEEVE].status = 'active';
    sleeves[ACTIVE_PAPER_SLEEVE].riskPct = riskPct;
    sleeves[activeId].riskPct = null;
  }

  const active = sleeves[ACTIVE_PAPER_SLEEVE];
  return {
    ids: [...SLEEVE_IDS],
    sleeves,
    activeId: ACTIVE_PAPER_SLEEVE,
    active,
    startingEquity,
    riskPct,
    minRiskPct: MIN_RISK_PCT,
    maxRiskPct: MAX_RISK_PCT,
    minPlannedR: MIN_PLANNED_R,
    maxPlannedR: MAX_PLANNED_R,
    buyingPowerMental: startingEquity * SLEEVE_IDS.length,
    rhResearchCash: parsePositiveNumber(env.PAPER_CASH, 100),
  };
}

function sleevesSnapshot(configOrSleeves) {
  const pack = configOrSleeves?.sleeves && configOrSleeves.activeId
    ? configOrSleeves
    : (configOrSleeves?.paperSleeves || loadSleeves());
  const sleeves = pack.sleeves || pack;
  return {
    buyingPowerMental: pack.buyingPowerMental || DEFAULT_SLEEVE_EQUITY * SLEEVE_IDS.length,
    activeId: pack.activeId || ACTIVE_PAPER_SLEEVE,
    riskPct: pack.riskPct || DEFAULT_RISK_PCT,
    rhResearchCash: pack.rhResearchCash ?? 100,
    note: 'Alpaca paper sleeves are a separate book from Robinhood Agentic. Live stays off.',
    sleeves: SLEEVE_IDS.map((id) => {
      const s = sleeves[id] || SLEEVE_DEFS[id];
      return {
        id,
        label: s.label,
        startingEquity: s.startingEquity,
        status: s.status,
        edge: s.edge,
        venue: s.venue,
        notes: s.notes,
        riskPct: s.riskPct,
      };
    }),
  };
}

module.exports = {
  SLEEVE_IDS,
  SLEEVE_DEFS,
  ACTIVE_PAPER_SLEEVE,
  DEFAULT_SLEEVE_EQUITY,
  MIN_RISK_PCT,
  MAX_RISK_PCT,
  DEFAULT_RISK_PCT,
  MIN_PLANNED_R,
  MAX_PLANNED_R,
  clampRiskPct,
  plannedR,
  inPlannedRBand,
  emptySleeveSnapshot,
  sleeveOfTrade,
  splitPnlBySleeve,
  isToyPaperAccount,
  loadSleeves,
  sleevesSnapshot,
};
