#!/usr/bin/env node
'use strict';

const { Pool } = require('pg');
const Alpaca = require('alpaca-trade-api');
const dotenv = require('dotenv');

const { loadConfig, DEFAULT_REPLAY_DAYS } = require('./lib/config');
const { ensureSchema } = require('./lib/schema');
const { createPgStore, createMemoryStore } = require('./lib/store');
const { createBarsClient } = require('./lib/bars');
const { runReplay, runRank, scanLatestSession } = require('./lib/pipeline');
const { isLiveEnabled } = require('./lib/robinhood');
const { runDailyCli } = require('./lib/daily');
const { runWeeklyCli } = require('./lib/weekly');
const { runOrb30Replay } = require('./lib/orb30Replay');

dotenv.config();

function makeStore() {
  if (!process.env.DB_NAME) {
    console.warn('No DB_NAME set; using in-memory journal (not durable).');
    return { store: createMemoryStore(), pool: null };
  }
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 5432),
  });
  return { store: createPgStore(pool), pool };
}

function makeBars() {
  let alpaca = null;
  try {
    alpaca = new Alpaca({
      keyId: process.env.ALPACA_API_KEY,
      secretKey: process.env.ALPACA_SECRET_KEY,
      paper: true,
    });
  } catch (err) {
    console.warn(`Alpaca client not available: ${err.message}`);
  }
  return createBarsClient({ alpaca });
}

function parsePaperArgs(argv = process.argv) {
  const rest = argv.slice(3);
  let reset = false;
  let days;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--reset') {
      reset = true;
      continue;
    }
    if (arg === '--days' && rest[i + 1] != null) {
      days = Number(rest[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--days=')) {
      days = Number(arg.slice('--days='.length));
      continue;
    }
    if (/^\d+$/.test(arg)) {
      days = Number(arg);
    }
  }
  const lookback = Number.isFinite(days) && days > 0 ? days : DEFAULT_REPLAY_DAYS;
  return { reset, days: lookback };
}

async function main(argv = process.argv) {
  const cmd = argv[2] || 'replay';
  const config = loadConfig();
  const { store, pool } = makeStore();
  if (pool) await ensureSchema(pool);

  try {
    if (cmd === 'daily') {
      await runDailyCli({ store, config });
    } else if (cmd === 'weekly') {
      await runWeeklyCli({ store, config });
    } else if (cmd === 'replay') {
      const { days, reset } = parsePaperArgs(argv);
      const barsClient = makeBars();
      const result = await runReplay({ store, barsClient, config, days, persist: true, reset });
      printReplay(result);
    } else if (cmd === 'scan' || cmd === 'today') {
      const barsClient = makeBars();
      const result = await scanLatestSession({ store, barsClient, config, persist: false });
      printScan(result);
    } else if (cmd === 'rank') {
      const result = await runRank({ store, config });
      printRank(result.rankings);
      console.log(`\nJournal rows=${result.trades} (rank is metrics-only; trade_journal and candle_bars were not deleted)`);
      console.log(`Live enabled: ${isLiveEnabled()}`);
    } else if (cmd === 'orb30') {
      const { days } = parsePaperArgs(argv);
      const barsClient = makeBars();
      const result = await runOrb30Replay({ store, barsClient, config, days });
      printOrb30(result);
    } else {
      console.error('Usage: node cli.js [replay|scan|rank|daily|weekly|orb30] [days] [--reset]');
      console.error('  replay  append/upsert journal from Alpaca history. Use --reset only to rebuild.');
      console.error('  rank    walk-forward from existing trade_journal. Does not delete fills or bars.');
      console.error('  orb30   paper walk-forward of the 30m-OR / 5m book (idea 8). Isolated journal; live off.');
      process.exitCode = 1;
    }
  } finally {
    if (pool) await pool.end();
  }
}

function printReplay(result) {
  const mode = result.reset ? 'RESET rebuild' : 'append/upsert';
  console.log(`Paper replay (${result.source}, ${mode})  universe=${result.universe.join(',')}  sessions=${result.days} lookbackDays=${result.lookbackDays}`);
  console.log(`Signals=${result.signals}  journaled trades=${result.trades}`);
  console.log(`Account cash=${result.account.cash.toFixed(2)} settled=${result.account.settledCash.toFixed(2)} unsettled=${result.account.unsettledCash.toFixed(2)} equity=${result.account.equity.toFixed(2)}`);
  console.log(`Live enabled: ${isLiveEnabled()}`);
  printRank(result.rankings);
  if (result.todaySignals?.length) {
    console.log('\nLatest-session signals:');
    for (const s of result.todaySignals) {
      console.log(`  ${s.sessionDate} ${s.symbol} ${s.setupId} ${s.side} @ ${s.paperPrice.toFixed(2)} — ${s.reason}`);
    }
  }
}

function printScan(result) {
  console.log(`Scan session=${result.sessionDate} source=${result.source} live=${result.liveEnabled}`);
  if (!result.signals.length) {
    console.log('No signals on the latest session.');
    return;
  }
  for (const s of result.signals) {
    console.log(`  ${s.symbol} ${s.setupId} ${s.side} @ ${Number(s.paperPrice).toFixed(2)} — ${s.reason}`);
  }
}

function printOrb30(result) {
  console.log(result.markdown);
  if (result.reportFile) console.error(`Wrote ${result.reportFile}`);
  console.log(`Live enabled: ${isLiveEnabled()}`);
  console.log(`liveEligible=${result.liveEligible} idea=${result.ideaId} book=${result.book} source=${result.source}`);
}

function printRank(rankings) {
  console.log('\nSetup ranking (walk-forward OOS):');
  for (const r of rankings || []) {
    const m = r.metrics;
    console.log(
      `  ${r.setupId.padEnd(22)} status=${r.status.padEnd(14)} liveEligible=${r.liveEligible}  oos_n=${m.trades} wr=${(m.winRate * 100).toFixed(0)}% pnl=${m.grossPnl.toFixed(2)} cons=${(m.consistency * 100).toFixed(0)}% dd=${m.maxDrawdown.toFixed(2)}`
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { main, parsePaperArgs };
