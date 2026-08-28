'use strict';

const { SETUPS } = require('./config');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultAccountRow() {
  return {
    id: 1,
    starting_cash: 100,
    cash: 100,
    settled_cash: 100,
    unsettled_cash: 0,
    equity: 100,
  };
}

function createMemoryStore() {
  let tradeId = 1;
  let metricId = 1;
  const state = {
    account: defaultAccountRow(),
    positions: [],
    trades: [],
    setups: SETUPS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: 'paper',
      live_eligible: false,
      params: {},
      metrics: null,
    })),
    metrics: [],
  };

  return {
    kind: 'memory',
    async resetPaper(startingCash = 100) {
      state.account = {
        id: 1,
        starting_cash: startingCash,
        cash: startingCash,
        settled_cash: startingCash,
        unsettled_cash: 0,
        equity: startingCash,
      };
      state.positions = [];
      state.trades = [];
      state.metrics = [];
      state.setups = state.setups.map((s) => ({
        ...s,
        status: 'paper',
        live_eligible: false,
        metrics: null,
      }));
    },
    async getAccount() {
      return clone(state.account);
    },
    async saveAccount(account) {
      state.account = {
        id: 1,
        starting_cash: account.startingCash ?? account.starting_cash,
        cash: account.cash,
        settled_cash: account.settledCash ?? account.settled_cash,
        unsettled_cash: account.unsettledCash ?? account.unsettled_cash,
        equity: account.equity,
      };
      return clone(state.account);
    },
    async listPositions() {
      return clone(state.positions);
    },
    async upsertPosition(position) {
      const idx = state.positions.findIndex((p) => p.symbol === position.symbol);
      if (position.quantity <= 0) {
        if (idx >= 0) state.positions.splice(idx, 1);
        return null;
      }
      const row = {
        symbol: position.symbol,
        quantity: position.quantity,
        avg_price: position.avgPrice ?? position.avg_price,
        opened_at: position.openedAt ?? position.opened_at ?? new Date().toISOString(),
        setup_id: position.setupId ?? position.setup_id ?? null,
      };
      if (idx >= 0) state.positions[idx] = row;
      else state.positions.push(row);
      return clone(row);
    },
    async insertTrade(trade) {
      const row = {
        id: tradeId,
        symbol: trade.symbol,
        ts: trade.ts,
        side: trade.side,
        setup_id: trade.setupId,
        features: trade.features || {},
        reason: trade.reason || '',
        paper_price: trade.paperPrice,
        size: trade.size,
        notional: trade.notional,
        stop_price: trade.stop ?? null,
        target_price: trade.target ?? null,
        status: trade.status || 'open',
        exit_ts: trade.exitTs ?? null,
        exit_price: trade.exitPrice ?? null,
        pnl: trade.pnl ?? null,
        outcome: trade.outcome ?? null,
        mode: trade.mode || 'paper',
      };
      tradeId += 1;
      state.trades.push(row);
      return clone(row);
    },
    async closeTrade(id, { exitTs, exitPrice, pnl, outcome, status = 'closed' }) {
      const row = state.trades.find((t) => t.id === id);
      if (!row) throw new Error(`trade ${id} not found`);
      row.exit_ts = exitTs;
      row.exit_price = exitPrice;
      row.pnl = pnl;
      row.outcome = outcome;
      row.status = status;
      return clone(row);
    },
    async listTrades({ limit = 200, setupId } = {}) {
      let rows = state.trades.slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      if (setupId) rows = rows.filter((t) => t.setup_id === setupId);
      return clone(rows.slice(0, limit));
    },
    async listSetups() {
      return clone(state.setups);
    },
    async saveSetupMetrics(setupId, metrics, { liveEligible, status }) {
      const setup = state.setups.find((s) => s.id === setupId);
      if (setup) {
        setup.metrics = metrics;
        setup.live_eligible = Boolean(liveEligible);
        setup.status = status;
        setup.updated_at = new Date().toISOString();
      }
      const row = {
        id: metricId,
        setup_id: setupId,
        window_start: metrics.windowStart ?? null,
        window_end: metrics.windowEnd ?? null,
        is_oos: true,
        trades: metrics.trades,
        wins: metrics.wins,
        gross_pnl: metrics.grossPnl,
        avg_pnl: metrics.avgPnl,
        win_rate: metrics.winRate,
        consistency: metrics.consistency,
        max_drawdown: metrics.maxDrawdown,
        promoted: Boolean(liveEligible),
      };
      metricId += 1;
      state.metrics.push(row);
      return clone(row);
    },
  };
}

function createPgStore(pool) {
  return {
    kind: 'pg',
    async resetPaper(startingCash = 100) {
      await pool.query('DELETE FROM trade_journal');
      await pool.query('DELETE FROM paper_positions');
      await pool.query('DELETE FROM setup_metrics');
      await pool.query(
        `UPDATE paper_account SET starting_cash=$1, cash=$1, settled_cash=$1, unsettled_cash=0, equity=$1, updated_at=NOW() WHERE id=1`,
        [startingCash]
      );
      await pool.query(`UPDATE setups SET status='paper', live_eligible=FALSE, metrics=NULL, updated_at=NOW()`);
    },
    async getAccount() {
      const { rows } = await pool.query('SELECT * FROM paper_account WHERE id=1');
      return rows[0] || defaultAccountRow();
    },
    async saveAccount(account) {
      const { rows } = await pool.query(
        `UPDATE paper_account
         SET starting_cash=$1, cash=$2, settled_cash=$3, unsettled_cash=$4, equity=$5, updated_at=NOW()
         WHERE id=1 RETURNING *`,
        [
          account.startingCash ?? account.starting_cash,
          account.cash,
          account.settledCash ?? account.settled_cash,
          account.unsettledCash ?? account.unsettled_cash,
          account.equity,
        ]
      );
      return rows[0];
    },
    async listPositions() {
      const { rows } = await pool.query('SELECT * FROM paper_positions ORDER BY symbol');
      return rows;
    },
    async upsertPosition(position) {
      if (position.quantity <= 0) {
        await pool.query('DELETE FROM paper_positions WHERE symbol=$1', [position.symbol]);
        return null;
      }
      const { rows } = await pool.query(
        `INSERT INTO paper_positions (symbol, quantity, avg_price, opened_at, setup_id)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (symbol) DO UPDATE SET quantity=EXCLUDED.quantity, avg_price=EXCLUDED.avg_price, setup_id=EXCLUDED.setup_id
         RETURNING *`,
        [
          position.symbol,
          position.quantity,
          position.avgPrice ?? position.avg_price,
          position.openedAt ?? position.opened_at ?? new Date(),
          position.setupId ?? position.setup_id ?? null,
        ]
      );
      return rows[0];
    },
    async insertTrade(trade) {
      const { rows } = await pool.query(
        `INSERT INTO trade_journal
          (symbol, ts, side, setup_id, features, reason, paper_price, size, notional,
           stop_price, target_price, status, exit_ts, exit_price, pnl, outcome, mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          trade.symbol,
          trade.ts,
          trade.side,
          trade.setupId,
          JSON.stringify(trade.features || {}),
          trade.reason || '',
          trade.paperPrice,
          trade.size,
          trade.notional,
          trade.stop ?? null,
          trade.target ?? null,
          trade.status || 'open',
          trade.exitTs ?? null,
          trade.exitPrice ?? null,
          trade.pnl ?? null,
          trade.outcome ?? null,
          trade.mode || 'paper',
        ]
      );
      return rows[0];
    },
    async closeTrade(id, { exitTs, exitPrice, pnl, outcome, status = 'closed' }) {
      const { rows } = await pool.query(
        `UPDATE trade_journal
         SET exit_ts=$2, exit_price=$3, pnl=$4, outcome=$5, status=$6
         WHERE id=$1 RETURNING *`,
        [id, exitTs, exitPrice, pnl, outcome, status]
      );
      return rows[0];
    },
    async listTrades({ limit = 200, setupId } = {}) {
      if (setupId) {
        const { rows } = await pool.query(
          'SELECT * FROM trade_journal WHERE setup_id=$1 ORDER BY ts DESC LIMIT $2',
          [setupId, limit]
        );
        return rows;
      }
      const { rows } = await pool.query(
        'SELECT * FROM trade_journal ORDER BY ts DESC LIMIT $1',
        [limit]
      );
      return rows;
    },
    async listSetups() {
      const { rows } = await pool.query('SELECT * FROM setups ORDER BY id');
      return rows;
    },
    async saveSetupMetrics(setupId, metrics, { liveEligible, status }) {
      await pool.query(
        `UPDATE setups SET metrics=$2, live_eligible=$3, status=$4, updated_at=NOW() WHERE id=$1`,
        [setupId, JSON.stringify(metrics), Boolean(liveEligible), status]
      );
      const { rows } = await pool.query(
        `INSERT INTO setup_metrics
          (setup_id, window_start, window_end, is_oos, trades, wins, gross_pnl, avg_pnl,
           win_rate, consistency, max_drawdown, promoted)
         VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          setupId,
          metrics.windowStart ?? null,
          metrics.windowEnd ?? null,
          metrics.trades,
          metrics.wins,
          metrics.grossPnl,
          metrics.avgPnl,
          metrics.winRate,
          metrics.consistency,
          metrics.maxDrawdown,
          Boolean(liveEligible),
        ]
      );
      return rows[0];
    },
  };
}

module.exports = { createMemoryStore, createPgStore };
