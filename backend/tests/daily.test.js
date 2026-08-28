'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { loadConfig } = require('../lib/config');
const { createMemoryStore } = require('../lib/store');
const { createBarsClient, generateUniverseBars, latestCompletedSessionDate } = require('../lib/bars');
const { formatDailyReport } = require('../lib/dailyReport');
const { runDaily, assertDailyReady, KEYS_REQUIRED_MESSAGE } = require('../lib/daily');
const { isLiveEnabled } = require('../lib/robinhood');

const FIXTURE = {
  sessionDate: '2026-08-27',
  source: 'alpaca',
  universe: ['SOFI', 'TSLA'],
  signals: [
    {
      symbol: 'SOFI',
      setupId: 'orb_breakout',
      side: 'BUY',
      paperPrice: 12.4,
      reason: 'OR breakout: close 12.40 > ORH 12.20, above VWAP 12.10, rvol 1.80',
    },
  ],
  fills: [
    {
      symbol: 'SOFI',
      setupId: 'orb_breakout',
      side: 'BUY',
      size: 2.016,
      paperPrice: 12.4,
      pnl: 0.42,
      outcome: 'win',
      status: 'closed',
    },
  ],
  sessionPnl: 0.42,
  startingCash: 100,
  account: {
    equity: 100.42,
    cash: 100.42,
    settledCash: 100.42,
    unsettledCash: 0,
    startingCash: 100,
  },
  rankings: [
    {
      setupId: 'orb_breakout',
      status: 'paper',
      liveEligible: false,
      metrics: {
        trades: 2,
        winRate: 0.5,
        grossPnl: 0.4,
        consistency: 1,
        maxDrawdown: 0.1,
      },
    },
  ],
  liveEnabled: false,
  alpacaPaperAccount: {
    ok: true,
    paper: true,
    label: 'PAPER',
    equity: 100000,
    cash: 95000,
    buyingPower: 95000,
    positionsCount: 0,
  },
};

describe('daily paper PoC report', () => {
  it('formats Slack-markdown sections from a fixture (no network)', () => {
    const report = formatDailyReport(FIXTURE);
    assert.match(report, /Daily paper PoC/);
    assert.match(report, /2026-08-27/);
    assert.match(report, /America\/New_York/);
    assert.match(report, /Bar source/);
    assert.match(report, /`alpaca`/);
    assert.match(report, /SOFI,TSLA/);
    assert.match(report, /\*Signals\*/);
    assert.match(report, /orb_breakout/);
    assert.match(report, /12\.40/);
    assert.match(report, /OR breakout/);
    assert.match(report, /\*Paper fills \/ P&L\*/);
    assert.match(report, /Session P&L/);
    assert.match(report, /\$100\.42/);
    assert.match(report, /\$100\.00/);
    assert.match(report, /\*Walk-forward\*/);
    assert.match(report, /oos_n=2/);
    assert.match(report, /liveEnabled/);
    assert.match(report, /`false`/);
    assert.match(report, /Alpaca PAPER account/);
    assert.match(report, /buying power/);
    assert.match(report, /positions count=0/);
    assert.equal(FIXTURE.liveEnabled, false);
    assert.equal(isLiveEnabled(), false);
  });

  it('skips walk-forward one-liners when there is no DB ranking', () => {
    const report = formatDailyReport({
      ...FIXTURE,
      rankings: null,
      alpacaPaperAccount: { ok: false, reason: 'unreachable', message: 'timeout' },
    });
    assert.match(report, /Skipped \(no DB \/ insufficient journal\)/);
    assert.match(report, /PAPER snapshot unreachable/);
  });
});

describe('daily runner fail-closed', () => {
  it('assertDailyReady rejects missing or placeholder keys', () => {
    assert.throws(() => assertDailyReady({}), /ALPACA_API_KEY/);
    assert.throws(
      () => assertDailyReady({ ALPACA_API_KEY: 'your_alpaca_key', ALPACA_SECRET_KEY: 'your_alpaca_secret' }),
      /placeholder/i
    );
    assert.match(KEYS_REQUIRED_MESSAGE, /Refusing synthetic/);
  });

  it('assertDailyReady refuses ALPACA_LIVE even with keys', () => {
    assert.throws(
      () => assertDailyReady({
        ALPACA_API_KEY: 'PKTEST',
        ALPACA_SECRET_KEY: 'secret',
        ALPACA_LIVE: '1',
      }),
      /live/
    );
  });

  it('createBarsClient(requireAlpaca) does not fall back to synthetic', async () => {
    const client = createBarsClient({ requireAlpaca: true, env: {} });
    await assert.rejects(() => client.loadBars(['SOFI']), /ALPACA_API_KEY/);
  });

  it('runDaily refuses synthetic bars', async () => {
    const config = loadConfig({ PAPER_CASH: '100', DAYTRADE_UNIVERSE: 'SOFI' });
    const store = createMemoryStore();
    const barsClient = createBarsClient({ env: {} });
    await assert.rejects(
      () => runDaily({ store, barsClient, config }),
      /synthetic/
    );
  });

  it('runDaily processes the latest completed alpaca session without live orders', async () => {
    const config = loadConfig({ PAPER_CASH: '100', DAYTRADE_UNIVERSE: 'SOFI' });
    const store = createMemoryStore();
    const bars = generateUniverseBars(['SOFI'], { days: 6, seed: 1 });
    for (const bar of bars.SOFI) bar.synthetic = false;
    const barsClient = { loadBars: async () => bars };
    const result = await runDaily({
      store,
      barsClient,
      config,
      now: new Date('2026-08-28T21:00:00Z'),
    });
    assert.equal(result.source, 'alpaca');
    assert.equal(result.liveEnabled, false);
    assert.ok(result.sessionDate);
    assert.equal(result.startingCash, 100);
    assert.ok(result.account.equity > 0);
    assert.equal(store.kind, 'memory');
    assert.equal(result.rankings, null, 'in-memory / no DB skips walk-forward');
  });

  it('cli daily exits non-zero without Alpaca keys', () => {
    const r = spawnSync(process.execPath, ['cli.js', 'daily'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        ALPACA_API_KEY: '',
        ALPACA_SECRET_KEY: '',
        DB_NAME: '',
        ALPACA_LIVE: '',
        ALPACA_SUBMIT_PAPER: '',
      },
      encoding: 'utf8',
    });
    assert.notEqual(r.status, 0);
    assert.match(`${r.stderr}\n${r.stdout}`, /ALPACA_API_KEY/);
  });
});

describe('latest completed RTH session', () => {
  it('drops today when the cash close has not happened yet', () => {
    const dates = ['2026-08-26', '2026-08-27'];
    const duringRth = new Date('2026-08-27T18:00:00Z'); // 14:00 ET EDT
    assert.equal(latestCompletedSessionDate(dates, duringRth), '2026-08-26');
    const afterClose = new Date('2026-08-27T21:00:00Z'); // 17:00 ET EDT
    assert.equal(latestCompletedSessionDate(dates, afterClose), '2026-08-27');
  });
});
