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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_journal_ts_idx ON trade_journal (ts DESC);
CREATE INDEX IF NOT EXISTS trade_journal_setup_idx ON trade_journal (setup_id);
`;

const { SETUPS } = require('./config');

async function ensureSchema(pool) {
  await pool.query(DDL);
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
