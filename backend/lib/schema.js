'use strict';

const DDL = `
CREATE TABLE IF NOT EXISTS portfolio (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL,
  type VARCHAR(10) NOT NULL,
  quantity DECIMAL NOT NULL,
  original_cost DECIMAL NOT NULL,
  purchase_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS paper_account (
  id INTEGER PRIMARY KEY DEFAULT 1,
  starting_cash DECIMAL NOT NULL DEFAULT 100,
  cash DECIMAL NOT NULL DEFAULT 100,
  settled_cash DECIMAL NOT NULL DEFAULT 100,
  unsettled_cash DECIMAL NOT NULL DEFAULT 0,
  equity DECIMAL NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_positions (
  symbol VARCHAR(20) PRIMARY KEY,
  quantity DECIMAL NOT NULL,
  avg_price DECIMAL NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  setup_id VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS setups (
  id VARCHAR(64) PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'paper',
  live_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS setup_metrics (
  id SERIAL PRIMARY KEY,
  setup_id VARCHAR(64) NOT NULL,
  window_start DATE,
  window_end DATE,
  is_oos BOOLEAN NOT NULL DEFAULT TRUE,
  trades INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  gross_pnl DECIMAL NOT NULL DEFAULT 0,
  avg_pnl DECIMAL NOT NULL DEFAULT 0,
  win_rate DECIMAL NOT NULL DEFAULT 0,
  consistency DECIMAL,
  max_drawdown DECIMAL,
  promoted BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trade_journal (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  side VARCHAR(8) NOT NULL,
  setup_id VARCHAR(64) NOT NULL,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  paper_price DECIMAL NOT NULL,
  size DECIMAL NOT NULL,
  notional DECIMAL NOT NULL,
  stop_price DECIMAL,
  target_price DECIMAL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  exit_ts TIMESTAMPTZ,
  exit_price DECIMAL,
  pnl DECIMAL,
  outcome VARCHAR(20),
  mode VARCHAR(16) NOT NULL DEFAULT 'paper',
  broker_order_id VARCHAR(64),
  asset_class VARCHAR(16) NOT NULL DEFAULT 'stocks',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_journal_ts_idx ON trade_journal (ts DESC);
CREATE INDEX IF NOT EXISTS trade_journal_setup_idx ON trade_journal (setup_id);

CREATE TABLE IF NOT EXISTS research_events (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  body TEXT,
  symbols TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS research_events_ts_idx ON research_events (created_at DESC);
CREATE INDEX IF NOT EXISTS research_events_kind_idx ON research_events (kind);

CREATE TABLE IF NOT EXISTS strategy_ideas (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  slack_channel TEXT,
  slack_ts TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'inbox',
  symbols TEXT[] NOT NULL DEFAULT '{}',
  setup_id VARCHAR(64),
  notes TEXT,
  school VARCHAR(32),
  book VARCHAR(64),
  timeframe VARCHAR(16),
  instrument_family VARCHAR(32),
  next_action TEXT,
  source_url TEXT,
  track VARCHAR(32),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS strategy_ideas_status_idx ON strategy_ideas (status, created_at DESC);

CREATE TABLE IF NOT EXISTS candle_bars (
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(16) NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  open DECIMAL NOT NULL,
  high DECIMAL NOT NULL,
  low DECIMAL NOT NULL,
  close DECIMAL NOT NULL,
  volume DECIMAL,
  session_date DATE,
  minute_of_day INT,
  source VARCHAR(32),
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (symbol, timeframe, ts)
);
CREATE INDEX IF NOT EXISTS candle_bars_session_idx ON candle_bars (symbol, session_date);
`;

const { SETUPS } = require('./config');

async function ensureSchema(pool) {
  await pool.query(DDL);
  await pool.query(`
    ALTER TABLE trade_journal
      ADD COLUMN IF NOT EXISTS broker_order_id VARCHAR(64)
  `);
  await pool.query(`
    ALTER TABLE trade_journal
      ADD COLUMN IF NOT EXISTS asset_class VARCHAR(16) DEFAULT 'stocks'
  `);
  await pool.query(`
    ALTER TABLE strategy_ideas
      ADD COLUMN IF NOT EXISTS school VARCHAR(32)
  `);
  await pool.query(`
    ALTER TABLE strategy_ideas
      ADD COLUMN IF NOT EXISTS book VARCHAR(64)
  `);
  await pool.query(`
    ALTER TABLE strategy_ideas
      ADD COLUMN IF NOT EXISTS timeframe VARCHAR(16)
  `);
  await pool.query(`
    ALTER TABLE strategy_ideas
      ADD COLUMN IF NOT EXISTS instrument_family VARCHAR(32)
  `);
  await pool.query(`
    ALTER TABLE strategy_ideas
      ADD COLUMN IF NOT EXISTS next_action TEXT
  `);
  await pool.query(`
    ALTER TABLE strategy_ideas
      ADD COLUMN IF NOT EXISTS source_url TEXT
  `);
  await pool.query(`
    ALTER TABLE strategy_ideas
      ADD COLUMN IF NOT EXISTS track VARCHAR(32)
  `);
  await pool.query(`
    INSERT INTO paper_account (id, starting_cash, cash, settled_cash, unsettled_cash, equity)
    VALUES (1, 100, 100, 100, 0, 100)
    ON CONFLICT (id) DO NOTHING
  `);
  for (const setup of SETUPS) {
    await pool.query(
      `INSERT INTO setups (id, name, description, status, live_eligible)
       VALUES ($1, $2, $3, 'paper', FALSE)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
      [setup.id, setup.name, setup.description]
    );
  }
}

module.exports = { DDL, ensureSchema };
