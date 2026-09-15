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
      return `• \`${s.symbol}\` ${setupName(s)} ${s.side} @ ${price} [${s.assetClass || 'stocks'}] — ${why}`;
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
      const facets = (r.facets || []).join('+');
      const flag = r.anomalyDependent ? ' anomaly_dependent' : '';
      return `• \`${r.setupId}\` family=${r.family || 'n/a'} ${facets ? `facets=${facets} ` : ''}asset=${r.assetClass || 'stocks'} status=${r.status} liveEligible=${r.liveEligible}${flag} oos_n=${m.trades ?? 0} wr=${pct(m.winRate)} pnl=${money(m.grossPnl)} cons=${pct(m.consistency)} dd=${money(m.maxDrawdown)}`;
    })
    .join('\n');
}

function formatPaperAccount(snapshot, { paperSubmitEnabled } = {}) {
  if (!snapshot) {
    return '_Alpaca PAPER snapshot not requested._';
  }
  if (!snapshot.ok) {
    return `_Alpaca PAPER snapshot unreachable_ (${snapshot.reason || 'error'}${snapshot.message ? `: ${snapshot.message}` : ''}). Local journal remains the fill source of truth.`;
  }
  const submitLine = paperSubmitEnabled
    ? '• *Paper broker POSTs:* on → `https://paper-api.alpaca.markets` (`PAPER_BROKER_ORDERS` / `ALPACA_SUBMIT_PAPER`) — live host refused'
    : '• *Paper broker POSTs:* off — local journal only (`PAPER_BROKER_ORDERS=false`)';
  return [
    '• *Venue:* Alpaca PAPER (`https://paper-api.alpaca.markets`) — no live orders',
    submitLine,
    `• equity=${money(snapshot.equity)}`,
    `• cash=${money(snapshot.cash)}`,
    `• buying power=${money(snapshot.buyingPower)}`,
    `• positions count=${snapshot.positionsCount ?? 0}`,
  ].join('\n');
}

function formatPaperBroker(paperBroker, paperSubmitEnabled) {
  if (!paperSubmitEnabled) {
    return '_Paper broker POSTs disabled. Journal fills were not mirrored to Alpaca._';
  }
  if (!paperBroker) {
    return '_No paper broker summary._';
  }
  const lines = [
    `• submitted=${paperBroker.submitted ?? 0} skipped=${paperBroker.skipped ?? 0} failed=${paperBroker.failed ?? 0} duplicates=${paperBroker.duplicates ?? 0}`,
  ];
  const orders = Array.isArray(paperBroker.orders) ? paperBroker.orders : [];
  for (const o of orders.slice(0, 12)) {
    const id = o.brokerOrderId || 'n/a';
    const cid = o.clientOrderId || 'n/a';
    const flag = o.submitted ? (o.duplicate ? 'dup' : 'ok') : (o.reason || 'fail');
    lines.push(`• \`${o.symbol}\` ${o.side} ${flag} broker_order_id=\`${id}\` client_order_id=\`${cid}\``);
  }
  if (orders.length > 12) {
    lines.push(`• _…${orders.length - 12} more_`);
  }
  return lines.join('\n');
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
    `• *Named edge:* ${result.namedEdge || 'Stock auction: OR + VWAP + rvol'}`,
    `• *Regime:* \`${result.regime || 'n/a'}\``,
    `• *Risk model:* flatten-by-close; local journal fills; Alpaca paper POSTs ${result.paperSubmitEnabled ? 'on' : 'off'}; Alpaca live trading off; Robinhood live off; NinjaTrader not used; options not on $100 cash book`,
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
    formatPaperAccount(result.alpacaPaperAccount, { paperSubmitEnabled: result.paperSubmitEnabled === true }),
    '',
    '*Alpaca paper POSTs*',
    formatPaperBroker(result.paperBroker, result.paperSubmitEnabled === true),
  ];
  return `${lines.join('\n')}\n`;
}

module.exports = {
  formatDailyReport,
  formatSignals,
  formatFills,
  formatRankings,
  formatPaperBroker,
  money,
  pct,
};
