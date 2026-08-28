'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { hasAlpacaKeys, latestCompletedSessionDate, createBarsClient } = require('./bars');
const { createAccount } = require('./paper');
const { simulateSession, allSessionDates } = require('./pipeline');
const { rankAndPromote, sessionOf } = require('./rank');
const { formatDailyReport } = require('./dailyReport');
const {
  assertPaperOnly,
  createAlpacaPaperClient,
  submitPaperOrder,
  fetchPaperAccountSnapshot,
  isPaperSubmitEnabled,
} = require('./alpacaPaper');

const REPORT_DIR = path.join(__dirname, '..', 'reports');
const REPORT_FILE = path.join(REPORT_DIR, 'latest.md');

const KEYS_REQUIRED_MESSAGE = [
  'paper:daily requires real Alpaca paper API keys (ALPACA_API_KEY and ALPACA_SECRET_KEY).',
  'Placeholder values from .env_template are not accepted.',
  'Refusing synthetic bars so this live-data PoC cannot be faked.',
  'Mint paper keys at https://app.alpaca.markets/account/login (Paper Trading → API Keys).',
].join(' ');

function assertDailyReady(env = process.env) {
  if (!hasAlpacaKeys(env)) {
    const err = new Error(KEYS_REQUIRED_MESSAGE);
    err.code = 'ALPACA_KEYS_REQUIRED';
    throw err;
  }
  assertPaperOnly(env);
  return true;
}

function assertAlpacaBars(barsBySymbol) {
  const all = Object.values(barsBySymbol || {}).flat();
  if (!all.length) {
    const err = new Error(
      'Alpaca returned no 5m RTH IEX bars for the daily PoC. Refusing synthetic fallback.'
    );
    err.code = 'ALPACA_BARS_EMPTY';
    throw err;
  }
  if (all.some((b) => b.synthetic)) {
    const err = new Error(
      'daily refuses synthetic bars; Alpaca IEX 5m bars are required (scan/replay may still degrade to synthetic).'
    );
    err.code = 'ALPACA_BARS_SYNTHETIC';
    throw err;
  }
}

function accountFromStoreRow(row, startingCash) {
  if (!row) return createAccount(startingCash);
  return {
    startingCash: Number(row.starting_cash ?? row.startingCash ?? startingCash),
    cash: Number(row.cash ?? startingCash),
    settledCash: Number(row.settled_cash ?? row.settledCash ?? row.cash ?? startingCash),
    unsettledCash: Number(row.unsettled_cash ?? row.unsettledCash ?? 0),
    equity: Number(row.equity ?? startingCash),
    dayStartEquity: Number(row.equity ?? startingCash),
    entriesToday: 0,
    sessionDate: row.sessionDate ?? row.session_date ?? null,
  };
}

function writeLatestReport(markdown, { dir = REPORT_DIR, file = REPORT_FILE } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, markdown, 'utf8');
  return file;
}

/**
 * Run the paper engine against the latest completed RTH session.
 * Caller must supply a barsClient that does not fall back to synthetic.
 */
async function runDaily({
  store,
  barsClient,
  config,
  orderMirror = null,
  alpacaPaperAccount = null,
  now = new Date(),
  days = 20,
} = {}) {
  const barsBySymbol = await barsClient.loadBars(config.universe, { days });
  assertAlpacaBars(barsBySymbol);

  const dates = allSessionDates(barsBySymbol);
  const sessionDate = latestCompletedSessionDate(dates, now);
  if (!sessionDate) {
    const err = new Error('No completed RTH session in Alpaca 5m bars (America/New_York).');
    err.code = 'NO_COMPLETED_SESSION';
    throw err;
  }

  const sessionBarCount = Object.values(barsBySymbol)
    .flat()
    .filter((b) => b.sessionDate === sessionDate).length;
  if (!sessionBarCount) {
    const err = new Error(`Alpaca returned no RTH bars for completed session ${sessionDate}.`);
    err.code = 'ALPACA_BARS_EMPTY';
    throw err;
  }

  const existing = store ? await store.getAccount() : null;
  let account = accountFromStoreRow(existing, config.startingCash);

  const sim = await simulateSession({
    store,
    account,
    barsBySymbol,
    sessionDate,
    config,
    orderMirror,
  });
  account = sim.account;
  if (store) await store.saveAccount(account);

  const trades = store ? await store.listTrades({ limit: 2000 }) : [];
  const fills = trades.filter((t) => sessionOf(t) === sessionDate);
  const sessionPnl = fills.reduce((sum, t) => sum + Number(t.pnl || 0), 0);

  let rankings = null;
  if (store && store.kind === 'pg') {
    rankings = await rankAndPromote(store, {
      setups: config.setups,
      gates: config.promotion,
      trades,
    });
  }

  return {
    sessionDate,
    source: 'alpaca',
    universe: config.universe,
    signals: sim.sessionSignals,
    fills,
    sessionPnl,
    startingCash: config.startingCash,
    account,
    rankings,
    liveEnabled: false,
    alpacaPaperAccount,
    paperSubmitEnabled: isPaperSubmitEnabled(),
  };
}

async function runDailyCli({
  store,
  config,
  env = process.env,
  now = new Date(),
  writeReport = true,
  log = console,
} = {}) {
  assertDailyReady(env);
  const alpaca = createAlpacaPaperClient({ env });
  const barsClient = createBarsClient({ alpaca, env, requireAlpaca: true });
  const alpacaPaperAccount = await fetchPaperAccountSnapshot(alpaca);
  const orderMirror = {
    submit: (order) => submitPaperOrder(alpaca, order, { env }),
  };
  const result = await runDaily({
    store,
    barsClient,
    config,
    orderMirror,
    alpacaPaperAccount,
    now,
  });
  const report = formatDailyReport(result);
  log.log(report);
  if (writeReport) {
    const file = writeLatestReport(report);
    log.error(`Wrote ${file}`);
  }
  return { result, report };
}

module.exports = {
  KEYS_REQUIRED_MESSAGE,
  REPORT_FILE,
  assertDailyReady,
  assertAlpacaBars,
  accountFromStoreRow,
  writeLatestReport,
  runDaily,
  runDailyCli,
};
