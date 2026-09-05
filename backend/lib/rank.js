'use strict';

const { embargoDates } = require('./regime');

function summarizeTrades(trades) {
  const closed = trades.filter((t) => t.status === 'closed' || t.pnl != null);
  const pnls = closed.map((t) => Number(t.pnl || 0));
  const wins = pnls.filter((p) => p > 0.01).length;
  const grossPnl = pnls.reduce((a, b) => a + b, 0);
  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  for (const pnl of pnls) {
    equity += pnl;
    if (equity > peak) peak = equity;
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  return {
    trades: closed.length,
    wins,
    grossPnl,
    avgPnl: closed.length ? grossPnl / closed.length : 0,
    winRate: closed.length ? wins / closed.length : 0,
    maxDrawdown,
  };
}

function walkForwardFolds(sessionDates, trainSize = 5, testSize = 2, { embargo = [] } = {}) {
  const blocked = new Set(embargo);
  const folds = [];
  let i = 0;
  while (i + trainSize + testSize <= sessionDates.length) {
    const train = sessionDates.slice(i, i + trainSize);
    const test = sessionDates.slice(i + trainSize, i + trainSize + testSize);
    const lastTrain = train.at(-1);
    const firstTest = test[0];
    const adjacentToEvent = blocked.has(lastTrain) || blocked.has(firstTest);
    if (!adjacentToEvent) {
      folds.push({ train, test });
    }
    i += testSize;
  }
  return folds;
}

function sessionOf(trade) {
  return trade.sessionDate || trade.features?.sessionDate || (trade.ts || '').slice(0, 10);
}

function tradeRMultiple(trade) {
  const entry = Number(trade.paperPrice ?? trade.paper_price);
  const stop = Number(trade.stop ?? trade.stop_price);
  const exit = Number(trade.exitPrice ?? trade.exit_price);
  if (![entry, stop, exit].every(Number.isFinite)) return null;
  const risk = entry - stop;
  if (!(risk > 0)) return null;
  return (exit - entry) / risk;
}

function summarizeR(trades) {
  const closed = (trades || []).filter((t) => t.status === 'closed' || t.pnl != null);
  const rs = closed.map(tradeRMultiple).filter((r) => r != null);
  const wins = rs.filter((r) => r > 0).length;
  const sum = rs.reduce((a, b) => a + b, 0);
  return {
    n: rs.length,
    wins,
    winRate: rs.length ? wins / rs.length : 0,
    expectancyR: rs.length ? sum / rs.length : null,
    sumR: rs.length ? sum : 0,
    unmeasured: rs.length < 8,
  };
}

function rankSetup(trades, { trainSize = 5, testSize = 2, embargo = embargoDates() } = {}) {
  const dates = [...new Set(trades.map(sessionOf).filter(Boolean))].sort();
  const folds = walkForwardFolds(dates, trainSize, testSize, { embargo });
  const oosTrades = [];
  const foldPnls = [];
  for (const fold of folds) {
    const testSet = new Set(fold.test);
    const foldTrades = trades.filter((t) => testSet.has(sessionOf(t)));
    const summary = summarizeTrades(foldTrades);
    foldPnls.push(summary.grossPnl);
    oosTrades.push(...foldTrades);
  }
  const oos = summarizeTrades(oosTrades);
  const positiveFolds = foldPnls.filter((p) => p > 0).length;
  const consistency = foldPnls.length ? positiveFolds / foldPnls.length : 0;
  return {
    ...oos,
    consistency,
    folds: folds.length,
    foldPnls,
    windowStart: dates[0] || null,
    windowEnd: dates[dates.length - 1] || null,
  };
}

function clearsPromotionGate(metrics, gates) {
  if (!metrics) return false;
  return (
    metrics.trades >= gates.minOosTrades &&
    metrics.winRate >= gates.minWinRate &&
    metrics.grossPnl > gates.minOosPnl &&
    metrics.consistency >= gates.minConsistency &&
    metrics.maxDrawdown <= gates.maxDrawdown
  );
}

function promotionDecision(metrics, gates) {
  const eligible = clearsPromotionGate(metrics, gates);
  return {
    liveEligible: eligible,
    // Execution stays paper even when a setup is live-eligible.
    status: eligible ? 'live-eligible' : 'paper',
    reason: eligible
      ? 'Cleared walk-forward OOS gates. Still paper until a human confirms a specific Robinhood MCP order.'
      : 'Remains research/paper. Did not clear OOS promotion gates.',
  };
}

async function rankAndPromote(store, { setups, gates, trades, variantsTried = 0, windows } = {}) {
  const { applyValidation } = require('./validate');
  const bySetup = new Map();
  for (const setup of setups) bySetup.set(setup.id, []);
  for (const trade of trades) {
    const id = trade.setupId || trade.setup_id;
    if (!bySetup.has(id)) bySetup.set(id, []);
    bySetup.get(id).push(trade);
  }
  const results = [];
  for (const setup of setups) {
    const setupTrades = bySetup.get(setup.id) || [];
    const metrics = rankSetup(setupTrades);
    const raw = promotionDecision(metrics, gates);
    const decision = applyValidation(metrics, raw, {
      trades: setupTrades,
      gates,
      variantsTried,
      windows,
    });
    if (store) {
      await store.saveSetupMetrics(setup.id, {
        ...metrics,
        anomalyDependent: Boolean(decision.anomalyDependent),
        promotionReason: decision.reason,
      }, decision);
    }
    results.push({
      setupId: setup.id,
      name: setup.name,
      family: setup.family || null,
      facets: setup.facets || [],
      assetClass: setup.assetClass || 'stocks',
      metrics,
      ...decision,
    });
  }
  results.sort((a, b) => b.metrics.grossPnl - a.metrics.grossPnl);
  return results;
}

module.exports = {
  summarizeTrades,
  walkForwardFolds,
  rankSetup,
  sessionOf,
  tradeRMultiple,
  summarizeR,
  clearsPromotionGate,
  promotionDecision,
  rankAndPromote,
};
