'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createAccount } = require('./paper');
const { createMemoryStore } = require('./store');
const { simulateSession, allSessionDates } = require('./pipeline');
const { rankSetup, summarizeR, summarizeTrades, sessionOf, walkForwardFolds, promotionDecision } = require('./rank');
const { applyValidation } = require('./validate');
const { embargoDates } = require('./regime');
const { isAuctionSkipDay, skipReason, filedAuctionSkipDates } = require('./newsSkip');
const {
  ORB30_BOOK_ID,
  ORB30_IDEA_ID,
  ORB30_SETUPS,
  ORB30_BOOK,
  orb30ConfigOverlay,
  signalsForOrb30,
  generateOrb30Universe,
} = require('./orb30');
const { signalsForSymbol } = require('./signals');
const { setupIdsForSymbol, PROMOTION_GATES } = require('./config');
const { hasAlpacaKeys } = require('./bars');

const REPORT_DIR = path.join(__dirname, '..', 'reports');
const REPORT_FILE = path.join(REPORT_DIR, 'orb30.md');

function variantById(setupId) {
  return ORB30_SETUPS.find((s) => s.id === setupId);
}

function collectOrb30Signals(variant) {
  return ({ session, prior, config }) => signalsForOrb30(session, {
    priorSessions: prior,
    config,
    variant,
  });
}

function collectNamedOrbSignals() {
  return ({ symbol, session, prior, config }) => signalsForSymbol(session, {
    priorSessions: prior,
    config,
    setupIds: setupIdsForSymbol(symbol, config.setups).filter((id) => id === 'orb_breakout'),
  });
}

async function replayBook({
  barsBySymbol,
  config,
  collectSignals,
  setups,
  skipMacroDays = false,
}) {
  const store = createMemoryStore();
  let account = createAccount(config.startingCash);
  const dates = allSessionDates(barsBySymbol);
  const skipped = [];
  for (const sessionDate of dates) {
    if (skipMacroDays && isAuctionSkipDay(sessionDate)) {
      skipped.push({ sessionDate, reason: skipReason(sessionDate) });
      continue;
    }
    const sim = await simulateSession({
      store,
      account,
      barsBySymbol,
      sessionDate,
      config,
      collectSignals,
    });
    account = sim.account;
  }
  const trades = await store.listTrades({ limit: 10000 });
  return { store, account, trades, dates, skipped };
}

function gradeVariant(trades, { gates = PROMOTION_GATES, variantsTried = ORB30_SETUPS.length } = {}) {
  const closed = trades.filter((t) => t.status === 'closed' || t.pnl != null);
  const journalR = summarizeR(closed);
  const journal = summarizeTrades(closed);
  const oos = rankSetup(closed);
  const oosDates = new Set();
  const dates = [...new Set(closed.map(sessionOf).filter(Boolean))].sort();
  const folds = walkForwardFolds(dates, 5, 2, { embargo: embargoDates() });
  for (const fold of folds) {
    for (const d of fold.test) oosDates.add(d);
  }
  const oosTrades = closed.filter((t) => oosDates.has(sessionOf(t)));
  const oosRMetrics = summarizeR(oosTrades);
  const raw = promotionDecision(oos, gates);
  const decision = applyValidation(oos, raw, {
    trades: closed,
    gates,
    variantsTried,
  });
  const oosN = oos.trades;
  const measured = oosN >= gates.minOosTrades;
  const liveEligible = Boolean(
    decision.liveEligible && measured && !decision.anomalyDependent
  );
  return {
    journal: {
      n: journal.trades,
      winRate: journal.winRate,
      expectancyR: journalR.expectancyR,
      grossPnl: journal.grossPnl,
      label: journal.trades ? 'unmeasured_journal' : 'no_fills',
    },
    oos: {
      n: oosN,
      winRate: oos.winRate,
      expectancyR: oosRMetrics.expectancyR,
      grossPnl: oos.grossPnl,
      consistency: oos.consistency,
      folds: oos.folds,
      label: measured ? 'measured' : 'unmeasured',
    },
    liveEligible,
    status: liveEligible ? 'live-eligible' : 'paper',
    anomalyDependent: Boolean(decision.anomalyDependent),
    reason: liveEligible
      ? decision.reason
      : (!measured
        ? `unmeasured: OOS n=${oosN} < minOosTrades ${gates.minOosTrades}`
        : (decision.reason || 'remains paper')),
  };
}

async function runVariant({ barsBySymbol, baseConfig, variant }) {
  const config = orb30ConfigOverlay(baseConfig);
  const replay = await replayBook({
    barsBySymbol,
    config,
    collectSignals: collectOrb30Signals(variant),
    setups: [variant],
    skipMacroDays: true,
  });
  const grade = gradeVariant(replay.trades);
  return {
    setupId: variant.id,
    slMode: variant.slMode,
    rMultiple: variant.rMultiple,
    book: ORB30_BOOK_ID,
    ideaId: ORB30_IDEA_ID,
    ...grade,
    skippedDays: replay.skipped.length,
    accountEquity: replay.account.equity,
    trades: replay.trades,
  };
}

async function runNamedNull({ barsBySymbol, baseConfig }) {
  const replay = await replayBook({
    barsBySymbol,
    config: baseConfig,
    collectSignals: collectNamedOrbSignals(),
    setups: (baseConfig.setups || []).filter((s) => s.id === 'orb_breakout'),
    skipMacroDays: false,
  });
  const orbTrades = replay.trades.filter((t) => (t.setupId || t.setup_id) === 'orb_breakout');
  const grade = gradeVariant(orbTrades, { variantsTried: (baseConfig.setups || []).length });
  return {
    setupId: 'orb_breakout',
    slMode: 'or_low',
    rMultiple: 1.5,
    book: 'stock_auction_5m',
    note: 'Nearby null: named 15m OR + VWAP + rvol, stop at OR low, 1.5R. Not this book.',
    ...grade,
    skippedDays: 0,
    accountEquity: replay.account.equity,
    trades: orbTrades,
  };
}

function formatPct(value) {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(0)}%`;
}

function formatR(value) {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}

function formatUsd(value) {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  const sign = value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function comparisonRows(results) {
  return results.map((row) => ({
    setupId: row.setupId,
    slMode: row.slMode,
    rMultiple: row.rMultiple,
    journalN: row.journal.n,
    journalWr: row.journal.winRate,
    journalExpR: row.journal.expectancyR,
    oosN: row.oos.n,
    oosWr: row.oos.winRate,
    oosExpR: row.oos.expectancyR,
    oosPnl: row.oos.grossPnl,
    label: row.oos.label,
    liveEligible: false,
    anomalyDependent: row.anomalyDependent,
  }));
}

function formatOrb30Report(result) {
  const lines = [
    '# 30m-OR / 5m book — paper walk-forward',
    '',
    `Idea **#${ORB30_IDEA_ID}** on the leif research journal. Book \`${ORB30_BOOK_ID}\`.`,
    'Paper only. Live off. Not stacked on `stock_auction_5m` / named 15m OR+VWAP+rvol.',
    '',
    `Source: **${result.source}**. LookbackDays=${result.lookbackDays}. Sessions=${result.sessions}. Universe: ${result.universe.join(', ')}.`,
    `News skip: NFP/CPI/FOMC (filed ${filedAuctionSkipDates().join(', ')} plus the same event types on the lookback calendar). Lunch blackout 11:30–13:30 ET. Flatten by cash close. Max 1 entry/day.`,
    '',
    `\`liveEligible=${result.liveEligible}\` — ${result.liveEligibleReason}`,
    '',
    '## Variant grid (SR vs Fib × 1R/2R/3R)',
    '',
    '| Setup | SL | R | journal n | journal WR | journal E[R] | OOS n | OOS WR | OOS E[R] | OOS $ | label | liveEligible |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of result.variants) {
    lines.push(
      `| \`${row.setupId}\` | ${row.slMode} | ${row.rMultiple}R | ${row.journal.n} | ${formatPct(row.journal.winRate)} | ${formatR(row.journal.expectancyR)} | ${row.oos.n} | ${formatPct(row.oos.winRate)} | ${formatR(row.oos.expectancyR)} | ${formatUsd(row.oos.grossPnl)} | ${row.oos.label} | false |`
    );
  }
  lines.push('');
  lines.push('## Nearby null (`orb_breakout` on the same tape)');
  lines.push('');
  if (result.nullBook) {
    const n = result.nullBook;
    lines.push(
      `Named 15m OR+VWAP+rvol, OR-low stop, 1.5R. Journal n=${n.journal.n} WR=${formatPct(n.journal.winRate)} E[R]=${formatR(n.journal.expectancyR)}. OOS n=${n.oos.n} WR=${formatPct(n.oos.winRate)} E[R]=${formatR(n.oos.expectancyR)} pnl=${formatUsd(n.oos.grossPnl)} label=${n.oos.label}. liveEligible=false.`
    );
  } else {
    lines.push('Null not run.');
  }
  lines.push('');
  lines.push('## Read');
  lines.push('');
  lines.push(result.read || '_See OOS columns. Journal is not a promotion gate._');
  lines.push('');
  lines.push('Do not promote from in-sample P&L. Do not compute SQN while n<30. Do not invent live eligibility.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function interpret(variants, nullBook) {
  const measured = variants.filter((v) => v.oos.label === 'measured');
  const bestOos = [...variants].sort((a, b) => {
    const ae = a.oos.expectancyR ?? -999;
    const be = b.oos.expectancyR ?? -999;
    return be - ae;
  })[0];
  const bits = [];
  if (!measured.length) {
    bits.push(
      `OOS n is below ${PROMOTION_GATES.minOosTrades} on every variant — status is **unmeasured**, not a failed or winning edge.`
    );
  } else {
    bits.push(
      `Measured variants: ${measured.map((v) => `\`${v.setupId}\``).join(', ')}.`
    );
  }
  if (bestOos && bestOos.oos.n > 0) {
    bits.push(
      `Highest OOS E[R] in this sample: \`${bestOos.setupId}\` at ${formatR(bestOos.oos.expectancyR)} (n=${bestOos.oos.n}, ${bestOos.oos.label}).`
    );
  }
  if (nullBook && nullBook.oos.n > 0) {
    const beat = bestOos && bestOos.oos.expectancyR != null && nullBook.oos.expectancyR != null
      && bestOos.oos.expectancyR > nullBook.oos.expectancyR;
    bits.push(
      `Nearby null \`${nullBook.setupId}\` OOS E[R]=${formatR(nullBook.oos.expectancyR)} (n=${nullBook.oos.n}, ${nullBook.oos.label}). ${beat ? 'Best orb30 variant beat the null on E[R] in this sample — still not a promotion.' : 'Did not clearly beat the null on OOS E[R] (or n is too small to say).'}`
    );
  }
  const sr = variants.filter((v) => v.slMode === 'sr');
  const fib = variants.filter((v) => v.slMode === 'fib');
  const mean = (rows) => {
    const xs = rows.map((r) => r.oos.expectancyR).filter((x) => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  bits.push(
    `SL-mode mean OOS E[R]: SR ${formatR(mean(sr))} vs Fib ${formatR(mean(fib))} (descriptive only; variantsTried=${variants.length}).`
  );
  return bits.join(' ');
}

async function loadOrb30Bars(barsClient, universe, { days, env = process.env } = {}) {
  if (barsClient && typeof barsClient.loadBars === 'function') {
    try {
      const barsBySymbol = await barsClient.loadBars(universe, { days });
      const all = Object.values(barsBySymbol || {}).flat();
      if (all.length) {
        const alpaca = hasAlpacaKeys(env) && all.some((b) => !b.synthetic);
        return { barsBySymbol, source: alpaca ? 'alpaca' : 'synthetic' };
      }
    } catch (err) {
      console.warn(`orb30 bars load failed (${err.message}); using orb30 synthetic tape`);
    }
  }
  const sessions = Math.max(14, Math.min(60, Math.round((Number(days) || 90) * 5 / 7)));
  return {
    barsBySymbol: generateOrb30Universe(universe, { sessions, startDate: '2026-06-01' }),
    source: 'synthetic_orb30',
  };
}

async function runOrb30Replay({
  barsClient,
  config,
  days,
  env = process.env,
  writeReport = true,
} = {}) {
  const lookbackDays = Number(days) > 0 ? Number(days) : config.replayDays || 90;
  const universe = config.universe || [];
  const { barsBySymbol, source } = await loadOrb30Bars(barsClient, universe, { days: lookbackDays, env });
  const variants = [];
  for (const variant of ORB30_SETUPS) {
    variants.push(await runVariant({ barsBySymbol, baseConfig: config, variant }));
  }
  const nullBook = await runNamedNull({
    barsBySymbol: source === 'synthetic_orb30'
      ? barsBySymbol
      : barsBySymbol,
    baseConfig: config,
  });
  const read = interpret(variants, nullBook);
  const alpacaTape = source === 'alpaca';
  for (const row of variants) {
    if (!alpacaTape) {
      row.liveEligible = false;
      row.status = 'paper';
      row.reason = 'synthetic tape — do not invent live eligibility from constructed bars';
    }
  }
  if (nullBook && !alpacaTape) {
    nullBook.liveEligible = false;
    nullBook.status = 'paper';
  }
  const anyMeasured = variants.some((v) => v.oos.label === 'measured');
  const anyLive = alpacaTape && variants.some((v) => v.liveEligible);
  const result = {
    book: ORB30_BOOK_ID,
    ideaId: ORB30_IDEA_ID,
    live: false,
    liveEligible: false,
    liveEligibleReason: anyLive
      ? 'a variant cleared gates — still paper until a human confirms a specific order'
      : (!alpacaTape
        ? 'synthetic / non-Alpaca tape: liveEligible=false (do not invent eligibility)'
        : (anyMeasured
          ? 'measured OOS exists but promotion gates / anomaly checks were not cleared'
          : `unmeasured: no variant has OOS n≥${PROMOTION_GATES.minOosTrades}`)),
    source,
    lookbackDays,
    sessions: allSessionDates(barsBySymbol).length,
    universe,
    variants,
    nullBook,
    comparison: comparisonRows(variants),
    read,
    bookMeta: ORB30_BOOK,
  };
  result.markdown = formatOrb30Report(result);
  if (writeReport) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_FILE, result.markdown, 'utf8');
    result.reportFile = REPORT_FILE;
  }
  return result;
}

module.exports = {
  REPORT_FILE,
  variantById,
  replayBook,
  gradeVariant,
  runVariant,
  runNamedNull,
  formatOrb30Report,
  interpret,
  loadOrb30Bars,
  runOrb30Replay,
  collectOrb30Signals,
};
