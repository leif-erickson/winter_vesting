'use strict';

/**
 * Shared NFP / CPI / FOMC skip for 5m US-cash books.
 *
 * Matches the research-board overlays already filed as skip_5m_auction:
 *   NFP 2026-09-04, CPI 2026-09-11, FOMC 2026-09-16
 * plus the same event types on a lookback calendar so a 90-day paper
 * replay actually skips those mornings. Overlay only — not a 6th facet.
 */

const FILED_AUCTION_SKIP = [
  { id: 'nfp', title: 'NFP', date: '2026-09-04' },
  { id: 'cpi', title: 'CPI', date: '2026-09-11' },
  { id: 'fomc', title: 'FOMC', date: '2026-09-16' },
];

/** Official FOMC *decision* days (statement / 2pm ET), 2025–2026. */
const FOMC_DECISION_DATES = [
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
  '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
];

/**
 * CPI release days (BLS 8:30 ET). 2026-09-11 is the filed board date.
 * Earlier 2026 / late-2025 dates cover DEFAULT_REPLAY_DAYS + holdout.
 */
const CPI_DATES = [
  '2025-09-11', '2025-10-10', '2025-11-13', '2025-12-10',
  '2026-01-13', '2026-02-12', '2026-03-11', '2026-04-10',
  '2026-05-13', '2026-06-11', '2026-07-15', '2026-08-12',
  '2026-09-11', '2026-10-14', '2026-11-10', '2026-12-10',
];

/**
 * NFP / Employment Situation. First Friday except the known New Year
 * delay (2026-01-09, not 2026-01-02).
 */
const NFP_DATES = [
  '2025-09-05', '2025-10-03', '2025-11-07', '2025-12-05',
  '2026-01-09', '2026-02-06', '2026-03-06', '2026-04-03',
  '2026-05-08', '2026-06-05', '2026-07-02', '2026-08-07',
  '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04',
];

function ymd(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function uniqueDates(rows) {
  return [...new Set(rows.map(ymd).filter(Boolean))].sort();
}

const AUCTION_SKIP_DATES = uniqueDates([
  ...FILED_AUCTION_SKIP.map((e) => e.date),
  ...NFP_DATES,
  ...CPI_DATES,
  ...FOMC_DECISION_DATES,
]);

const AUCTION_SKIP_SET = new Set(AUCTION_SKIP_DATES);

function isAuctionSkipDay(sessionDate) {
  const d = ymd(sessionDate);
  return Boolean(d && AUCTION_SKIP_SET.has(d));
}

function skipReason(sessionDate) {
  const d = ymd(sessionDate);
  if (!d) return null;
  if (NFP_DATES.includes(d) || d === '2026-09-04') return 'nfp';
  if (CPI_DATES.includes(d)) return 'cpi';
  if (FOMC_DECISION_DATES.includes(d)) return 'fomc';
  return isAuctionSkipDay(d) ? 'macro' : null;
}

function filedAuctionSkipDates() {
  return FILED_AUCTION_SKIP.map((e) => e.date);
}

module.exports = {
  FILED_AUCTION_SKIP,
  FOMC_DECISION_DATES,
  CPI_DATES,
  NFP_DATES,
  AUCTION_SKIP_DATES,
  isAuctionSkipDay,
  skipReason,
  filedAuctionSkipDates,
};
