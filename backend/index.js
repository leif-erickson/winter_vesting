// backend/index.js
const express = require('express');
const { Pool } = require('pg');
const ccxt = require('ccxt');
const Alpaca = require('alpaca-trade-api');
const dotenv = require('dotenv');
const cors = require('cors');

const { ensureSchema } = require('./lib/schema');
const { createPgStore } = require('./lib/store');
const { loadConfig, edgeSnapshot, DEFAULT_REPLAY_DAYS } = require('./lib/config');
const { createBarsClient } = require('./lib/bars');
const { runReplay, scanLatestSession, persistCandles } = require('./lib/pipeline');
const { isLiveEnabled, placeOrder: robinhoodPlace } = require('./lib/robinhood');
const { normalizeEvent, normalizeIdea } = require('./lib/research');
const { boardSnapshot } = require('./lib/researchBoard');
const { assessGoal } = require('./lib/goals');
const { getAgentContext } = require('./lib/agent');
const { sleevesSnapshot, splitPnlBySleeve } = require('./lib/sleeves');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ ok: true, liveEnabled: isLiveEnabled(), execution: 'paper' });
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
});

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true,
});

const exchange = new ccxt.binance({
  apiKey: process.env.BINANCE_API_KEY,
  secret: process.env.BINANCE_SECRET,
});

function getStore() {
  return createPgStore(pool);
}

function getBarsClient() {
  return createBarsClient({ alpaca });
}

function agentAuth(req, res, next) {
  const token = process.env.AGENT_TOKEN;
  if (!token) return next();
  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const got = bearer || req.get('x-agent-token') || '';
  if (got !== token) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

// GET all portfolio items with current values
app.get('/portfolio', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM portfolio');
    const enhancedRows = await Promise.all(rows.map(async (item) => {
      // A failing/unauthenticated market-data provider should not take down the
      // whole endpoint; return the holding with null pricing instead.
      let currentPrice = null;
      try {
        if (item.type === 'stock') {
          const quote = await alpaca.getLatestQuote(item.symbol);
          currentPrice = quote.AskPrice;
        } else if (item.type === 'crypto') {
          const ticker = await exchange.fetchTicker(`${item.symbol}/USDT`);
          currentPrice = ticker.last;
        }
      } catch (priceError) {
        console.warn(`Price lookup failed for ${item.symbol} (${item.type}): ${priceError.message}`);
      }
      const quantity = Number(item.quantity);
      const originalCost = Number(item.original_cost);
      const currentValue = currentPrice == null ? null : quantity * currentPrice;
      const profitLoss = currentPrice == null ? null : currentValue - (quantity * originalCost);
      return { ...item, current_price: currentPrice, current_value: currentValue, profit_loss: profitLoss };
    }));
    res.json(enhancedRows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/portfolio', async (req, res) => {
  const { symbol, type, quantity, original_cost } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO portfolio (symbol, type, quantity, original_cost) VALUES ($1, $2, $3, $4) RETURNING *',
      [symbol, type, quantity, original_cost]
    );
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/portfolio/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM portfolio WHERE id = $1', [id]);
    res.sendStatus(204);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/trading/account', async (_req, res) => {
  try {
    const account = await getStore().getAccount();
    const positions = await getStore().listPositions();
    res.json({ account, positions, liveEnabled: isLiveEnabled(), paperSleeves: sleevesSnapshot(loadConfig().paperSleeves) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/trading/journal', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    const trades = await getStore().listTrades({ limit });
    res.json({ trades });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/trading/setups', async (_req, res) => {
  try {
    const config = loadConfig();
    const byId = new Map(config.setups.map((s) => [s.id, s]));
    const setups = (await getStore().listSetups()).map((row) => {
      const meta = byId.get(row.id) || {};
      const metrics = row.metrics || {};
      return {
        ...row,
        family: meta.family || null,
        facets: meta.facets || [],
        assetClass: meta.assetClass || 'stocks',
        anomalyDependent: Boolean(metrics.anomalyDependent),
      };
    });
    res.json({ setups, liveEnabled: isLiveEnabled() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/trading/signals', async (req, res) => {
  try {
    const config = loadConfig();
    const result = await scanLatestSession({
      store: getStore(),
      barsClient: getBarsClient(),
      config,
      persist: false,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/trading/pnl', async (_req, res) => {
  try {
    const store = getStore();
    const account = await store.getAccount();
    const trades = await store.listTrades({ limit: 500 });
    const closed = trades.filter((t) => t.status === 'closed');
    const realized = closed.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    const sleevePnl = splitPnlBySleeve(trades);
    const config = loadConfig();
    res.json({
      startingCash: Number(account.starting_cash ?? config.startingCash),
      cash: Number(account.cash),
      settledCash: Number(account.settled_cash),
      unsettledCash: Number(account.unsettled_cash),
      equity: Number(account.equity),
      realizedPnl: realized,
      tradeCount: trades.length,
      sleevePnl,
      paperSleeves: sleevesSnapshot(config.paperSleeves),
      liveEnabled: isLiveEnabled(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/trading/replay', async (req, res) => {
  try {
    const config = loadConfig();
    const days = Number(req.body?.days || DEFAULT_REPLAY_DAYS);
    const reset = req.body?.reset === true || req.body?.reset === '1';
    const result = await runReplay({
      store: getStore(),
      barsClient: getBarsClient(),
      config,
      days,
      persist: true,
      reset,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/trading/scan', async (_req, res) => {
  try {
    const config = loadConfig();
    const result = await scanLatestSession({
      store: getStore(),
      barsClient: getBarsClient(),
      config,
      persist: false,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/research/edge', async (_req, res) => {
  try {
    const store = getStore();
    const ideas = store.listIdeas ? await store.listIdeas({ limit: 50 }) : [];
    const setups = await store.listSetups();
    const edge = edgeSnapshot({ ...loadConfig(), ideas, setups });
    res.json(edge);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/research/board', async (_req, res) => {
  try {
    const store = getStore();
    const ideas = store.listIdeas ? await store.listIdeas({ limit: 50 }) : [];
    const setups = await store.listSetups();
    res.json(boardSnapshot({ ideas, setups }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/research/goals', async (_req, res) => {
  try {
    const config = loadConfig();
    const store = getStore();
    const account = await store.getAccount();
    const setups = await store.listSetups();
    const oos = setups.reduce(
      (acc, s) => {
        const m = s.metrics || {};
        acc.pnl += Number(m.grossPnl ?? m.gross_pnl ?? 0);
        acc.sessions = Math.max(acc.sessions, Number(m.trades || 0));
        return acc;
      },
      { pnl: 0, sessions: 0 }
    );
    res.json(assessGoal({
      startingCash: Number(account.starting_cash ?? config.startingCash),
      equity: Number(account.equity ?? config.startingCash),
      doubleDays: config.goalDoubleDays,
      oosPnl: oos.pnl,
      oosSessions: oos.sessions,
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/research/events', async (req, res) => {
  try {
    const events = await getStore().listEvents({
      limit: Number(req.query.limit || 50),
      kind: req.query.kind,
    });
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/research/events', agentAuth, async (req, res) => {
  try {
    const event = normalizeEvent(req.body || {});
    if (!event.title) return res.status(400).json({ error: 'title is required' });
    const row = await getStore().insertEvent(event);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/research/ideas', async (req, res) => {
  try {
    const ideas = await getStore().listIdeas({
      limit: Number(req.query.limit || 50),
      status: req.query.status,
    });
    const board = boardSnapshot({ ideas, setups: await getStore().listSetups() });
    res.json({
      ideas,
      nextToExplore: board.nextToExplore,
      liveEligibleFromBoard: false,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/research/ideas', agentAuth, async (req, res) => {
  try {
    const idea = normalizeIdea(req.body || {});
    if (!idea.title || !idea.hypothesis) {
      return res.status(400).json({ error: 'title and hypothesis are required' });
    }
    const row = await getStore().insertIdea(idea);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/research/ideas/:id', agentAuth, async (req, res) => {
  try {
    const row = await getStore().updateIdea(req.params.id, req.body || {});
    res.json(row);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
});

app.get('/research/candles', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const candles = await getStore().listCandles({
      symbol,
      timeframe: req.query.timeframe || '5m',
      sessionDate: req.query.sessionDate,
      limit: Number(req.query.limit || 500),
    });
    res.json({ symbol, candles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/research/candles/stats', async (_req, res) => {
  try {
    res.json(await getStore().candleStats());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/research/candles/ingest', agentAuth, async (req, res) => {
  try {
    const config = loadConfig();
    const days = Number(req.body?.days || 20);
    const barsBySymbol = await getBarsClient().loadBars(config.universe, { days });
    const result = await persistCandles(getStore(), barsBySymbol, `${config.barMinutes || 5}m`);
    const stats = await getStore().candleStats();
    res.json({
      source: Object.values(barsBySymbol)[0]?.[0]?.synthetic ? 'synthetic' : 'alpaca',
      ...result,
      ...stats,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/agent/context', agentAuth, async (_req, res) => {
  try {
    const context = await getAgentContext(getStore(), loadConfig());
    res.json(context);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/agent/ideas', agentAuth, async (req, res) => {
  try {
    const idea = normalizeIdea({ ...(req.body || {}), source: req.body?.source || 'grokbot' });
    if (!idea.title || !idea.hypothesis) {
      return res.status(400).json({ error: 'title and hypothesis are required' });
    }
    const row = await getStore().insertIdea(idea);
    res.status(201).json({
      idea: row,
      next: 'Stays inbox/exploring. Replay paper against candles, then journal. Not a live order.',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Live Robinhood path is a hard-off stub. Grok Bot may call Robinhood MCP
// (review then place) only after the user confirms a specific order.
app.post('/trading/live/order', async (req, res) => {
  const result = await robinhoodPlace(req.body || {});
  const status = result.ok ? 200 : 403;
  res.status(status).json(result);
});

async function waitForDb(db, { timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (err) {
      // Wrong user/password will not recover by waiting.
      if (err.code === '28P01' || err.code === '28000') throw err;
      if (Date.now() >= deadline) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function start(port = Number(process.env.PORT || 5000)) {
  await waitForDb(pool);
  await ensureSchema(pool);
  const host = process.env.HOST || '0.0.0.0';
  return app.listen(port, host, () => {
    console.log(`Backend server running on port ${port}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { app, start, pool };
