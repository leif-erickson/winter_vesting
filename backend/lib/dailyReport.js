'use strict';

/**
 * Slack mrkdwn daily paper PoC report.
 * Incoming Webhooks use *bold*, `code`, and bullet lists (not GFM tables).
 */

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'n/a';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'n/a';
  return `${(n * 100).toFixed(0)}%`;
}

function setupName(signal) {
  return signal.setupId || signal.setup_id || 'unknown';
}

function formatSignals(signals) {
  if (!signals || !signals.length) {
    return '_No signals on this session._';
  }
  return signals
    .map((s) => {
      const px = Number(s.paperPrice ?? s.paper_price);
      const price = Number.isFinite(px) ? px.toFixed(2) : 'n/a';
      const why = s.reason || 'no reason';
      return `• \`${s.symbol}\` ${setupName(s)} ${s.side} @ ${price} — ${why}`;
    })
    .join('\n');
}

function formatFills(fills) {
  if (!fills || !fills.length) {
    return '_No paper fills this session (flatten-by-close still applied if a position was open)._';
  }
  return fills
    .map((f) => {
      const px = Number(f.paperPrice ?? f.paper_price);
      const pnl = f.pnl == null ? 'open' : money(f.pnl);
      const outcome = f.outcome || f.status || '';
      const size = f.size != null ? Number(f.size) : '';
      return `• \`${f.symbol}\` ${setupName(f)} ${f.side} size=${size} @ ${Number.isFinite(px) ? px.toFixed(2) : 'n/a'} pnl=${pnl} ${outcome}`.trim();
    })
    .join('\n');
}

function formatRankings(rankings) {
  if (!rankings || !rankings.length) {
    return '_Skipped (no DB / insufficient journal)._';
  }
  return rankings
    .map((r) => {
      const m = r.metrics || {};
      return `• \`${r.setupId}\` status=${r.status} liveEligible=${r.liveEligible} oos_n=${m.trades ?? 0} wr=${pct(m.winRate)} pnl=${money(m.grossPnl)} cons=${pct(m.consistency)} dd=${money(m.maxDrawdown)}`;
    })
    .join('\n');
}

function formatPaperAccount(snapshot) {
  if (!snapshot) {
    return '_Alpaca PAPER snapshot not requested._';
  }
  if (!snapshot.ok) {
    return `_Alpaca PAPER snapshot unreachable_ (${snapshot.reason || 'error'}${snapshot.message ? `: ${snapshot.message}` : ''}). Local journal remains the fill source of truth.`;
  }
  return [
    '• *Venue:* Alpaca PAPER (`https://paper-api.alpaca.markets`) — read-only GET, no live orders',
    `• equity=${money(snapshot.equity)}`,
    `• cash=${money(snapshot.cash)}`,
    `• buying power=${money(snapshot.buyingPower)}`,
    `• positions count=${snapshot.positionsCount ?? 0}`,
  ].join('\n');
}

/**
 * @param {object} result
 * @returns {string} Slack mrkdwn
 */
function formatDailyReport(result) {
  const sessionDate = result.sessionDate || 'unknown';
  const source = result.source || 'fail';
  const universe = Array.isArray(result.universe) ? result.universe.join(',') : String(result.universe || '');
  const startingCash = Number(result.startingCash ?? result.account?.startingCash ?? 100);
  const equity = Number(result.account?.equity ?? startingCash);
  const sessionPnl = Number(result.sessionPnl ?? 0);
  const liveEnabled = result.liveEnabled === true;
  const vsStart = equity - startingCash;

  const lines = [
    `*Daily paper PoC* — live data, paper fills, no live money`,
    `• *Session:* \`${sessionDate}\` (America/New_York)`,
    `• *Bar source:* \`${source}\``,
    `• *Universe:* ${universe || '_empty_'}`,
    `• *liveEnabled:* \`${liveEnabled}\``,
    `• *Risk model:* flatten-by-close; local journal fills; Alpaca live trading off; Robinhood live off; NinjaTrader not used`,
    '',
    '*Signals*',
    formatSignals(result.signals),
    '',
    '*Paper fills / P&L*',
    formatFills(result.fills),
    `• *Session P&L:* ${money(sessionPnl)}`,
    `• *Equity:* ${money(equity)} vs ${money(startingCash)} starting cash (${vsStart >= 0 ? '+' : ''}${money(vsStart)})`,
    '',
    '*Walk-forward*',
    formatRankings(result.rankings),
    '',
    '*Alpaca PAPER account*',
    formatPaperAccount(result.alpacaPaperAccount),
  ];
  return `${lines.join('\n')}\n`;
}

module.exports = {
  formatDailyReport,
  formatSignals,
  formatFills,
  formatRankings,
  money,
};
