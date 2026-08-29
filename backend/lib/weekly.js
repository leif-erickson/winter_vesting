'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { NAMED_EDGE, ASSET_BOOKS, loadConfig } = require('./config');
const { FROZEN_ANOMALY_WINDOWS, frozenRegime } = require('./regime');
const { sessionOf, rankAndPromote } = require('./rank');
const { money, pct } = require('./dailyReport');

const REPORT_DIR = path.join(__dirname, '..', 'reports');
const WEEKLY_FILE = path.join(REPORT_DIR, 'weekly.md');

function formatWeeklyEdgeReport({
  namedEdge = NAMED_EDGE,
  rankings = [],
  trades = [],
  ideas = [],
  sessionDates = [],
  windows = FROZEN_ANOMALY_WINDOWS,
} = {}) {
  const regimes = { expansion: 0, reset: 0, quiet: 0 };
  for (const d of sessionDates) {
    const r = frozenRegime(d, windows) || 'quiet';
    regimes[r] = (regimes[r] || 0) + 1;
  }
  const frozenPnl = (trades || [])
    .filter((t) => windows.some((w) => {
      const d = sessionOf(t);
      return d >= w.start && d <= w.end;
    }))
    .reduce((s, t) => s + Number(t.pnl || 0), 0);
  const allPnl = (trades || []).reduce((s, t) => s + Number(t.pnl || 0), 0);
  const exploring = (ideas || []).filter((i) => i.status === 'exploring' || i.status === 'inbox');
  const experiment = exploring[0] || null;

  const rankingLines = (rankings || []).map((r) => {
    const m = r.metrics || {};
    const flag = r.anomalyDependent ? ' anomaly_dependent' : '';
    return `• \`${r.setupId}\` family=${r.family || 'n/a'} facets=${(r.facets || []).join('+') || 'n/a'} asset=${r.assetClass || 'stocks'} status=${r.status} liveEligible=${r.liveEligible}${flag} oos_n=${m.trades ?? 0} wr=${pct(m.winRate)} pnl=${money(m.grossPnl)}`;
  });

  const lines = [
    '*Weekly edge maintenance*',
    `• *Named edge:* ${namedEdge}`,
    '• *Maintain by:* same 2–5 facets; change where it may fire (family/regime); one experiment slot; do not add facets because the week was green.',
    '• *AMT map:* 15m OR → initial_balance; VWAP → value; rvol → participation. SMC/VSA are journal tags only (not confirms). Orderflow parked. Gann/Tori are swing books, not 5m facets. One school_book per slot.',
    `• *Regime mix this sample:* expansion=${regimes.expansion} reset=${regimes.reset} quiet=${regimes.quiet}`,
    `• *Frozen-window P&L share:* ${money(frozenPnl)} of ${money(allPnl)} (Oct–Nov 2025 holdout must not be the whole story)`,
    '',
    '*Kill / park / promote*',
    rankingLines.length ? rankingLines.join('\n') : '_No rankings._',
    '',
    '*Asset books*',
    ...Object.entries(ASSET_BOOKS).map(([k, v]) => `• \`${k}\` venue=${v.venue} live=${v.live} — ${v.notes}`),
    '',
    '*One experiment slot*',
    experiment
      ? `• #${experiment.id} \`${experiment.title}\` status=${experiment.status} — paper or reject; do not silently grow facets.`
      : '_Inbox empty. Grokbot: POST /agent/ideas._',
    '',
    '*Cross-asset glance*',
    '• Same vol event should be compared on QQQ/NVDA (stocks), NQ (futures book — live in candlemaster), BTC (crypto paper). Do not stack them as extra confirms on one stock trigger.',
    '• Options: IV crush after a melt-up is a separate book. Not on the $100 RH cash account.',
  ];
  return `${lines.join('\n')}\n`;
}

function writeWeeklyReport(markdown, { dir = REPORT_DIR, file = WEEKLY_FILE } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, markdown, 'utf8');
  return file;
}

async function runWeekly({ store, config } = {}) {
  const cfg = config || loadConfig();
  const trades = store ? await store.listTrades({ limit: 2000 }) : [];
  let rankings = [];
  if (store) {
    rankings = await rankAndPromote(store, {
      setups: cfg.setups,
      gates: cfg.promotion,
      trades,
      variantsTried: cfg.variantsTried,
      windows: cfg.frozenWindows,
    });
  }
  const ideas = store?.listIdeas ? await store.listIdeas({ limit: 20 }) : [];
  const sessionDates = [...new Set(trades.map(sessionOf).filter(Boolean))].sort();
  const markdown = formatWeeklyEdgeReport({
    namedEdge: cfg.namedEdge,
    rankings,
    trades,
    ideas,
    sessionDates,
    windows: cfg.frozenWindows,
  });
  return { markdown, rankings, sessionDates, trades };
}

async function runWeeklyCli({
  store,
  config,
  writeReport = true,
  log = console,
} = {}) {
  const result = await runWeekly({ store, config });
  log.log(result.markdown);
  if (writeReport) {
    const file = writeWeeklyReport(result.markdown);
    log.error(`Wrote ${file}`);
  }
  return result;
}

module.exports = {
  WEEKLY_FILE,
  formatWeeklyEdgeReport,
  writeWeeklyReport,
  runWeekly,
  runWeeklyCli,
};
