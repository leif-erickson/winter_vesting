'use strict';

const { SETUPS } = require('./config');
const { toIdeaRow, ideaLedgerPatch } = require('./research');

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
  let eventId = 1;
  let ideaId = 1;
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
    events: [],
    ideas: [],
    candles: [],
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
        broker_order_id: trade.brokerOrderId ?? trade.broker_order_id ?? null,
        asset_class: trade.assetClass || trade.asset_class || 'stocks',
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
    async setBrokerOrderId(id, brokerOrderId) {
      const row = state.trades.find((t) => t.id === id);
      if (!row) throw new Error(`trade ${id} not found`);
      row.broker_order_id = brokerOrderId;
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
    async insertEvent(event) {
      const row = {
        id: eventId,
        kind: event.kind,
        source: event.source,
        title: event.title,
        url: event.url || null,
        body: event.body || '',
        symbols: event.symbols || [],
        tags: event.tags || [],
        published_at: event.publishedAt || event.published_at || null,
        created_at: new Date().toISOString(),
      };
      eventId += 1;
      state.events.unshift(row);
      return clone(row);
    },
    async listEvents({ limit = 50, kind } = {}) {
      let rows = state.events.slice();
      if (kind) rows = rows.filter((e) => e.kind === kind);
      return clone(rows.slice(0, limit));
    },
    async insertIdea(idea) {
      const now = new Date().toISOString();
      const row = toIdeaRow(idea, { id: ideaId, created_at: now, updated_at: now });
      ideaId += 1;
      state.ideas.unshift(row);
      return clone(row);
    },
    async listIdeas({ limit = 50, status } = {}) {
      let rows = state.ideas.slice();
      if (status) rows = rows.filter((i) => i.status === status);
      return clone(rows.slice(0, limit));
    },
    async updateIdea(id, patch) {
      const row = state.ideas.find((i) => i.id === Number(id));
      if (!row) throw new Error(`idea ${id} not found`);
      Object.assign(row, ideaLedgerPatch(patch));
      row.updated_at = new Date().toISOString();
      return clone(row);
    },
    async upsertCandles(bars) {
      for (const bar of bars || []) {
        const key = `${bar.symbol}|${bar.timeframe}|${bar.ts}`;
        const idx = state.candles.findIndex(
          (c) => `${c.symbol}|${c.timeframe}|${c.ts}` === key
        );
        const row = {
          symbol: bar.symbol,
          timeframe: bar.timeframe,
          ts: bar.ts,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume ?? 0,
          session_date: bar.sessionDate || bar.session_date || null,
          minute_of_day: bar.minuteOfDay ?? bar.minute_of_day ?? null,
          source: bar.source || null,
        };
        if (idx >= 0) state.candles[idx] = row;
        else state.candles.push(row);
      }
      return { upserted: (bars || []).length };
    },
    async listCandles({ symbol, timeframe = '5m', sessionDate, limit = 500 } = {}) {
      let rows = state.candles.filter((c) => c.symbol === symbol && c.timeframe === timeframe);
      if (sessionDate) {
        rows = rows.filter((c) => String(c.session_date).slice(0, 10) === sessionDate);
      }
      rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
      return clone(rows.slice(-limit));
    },
    async candleStats() {
      const symbols = [...new Set(state.candles.map((c) => c.symbol))].sort();
      return { bars: state.candles.length, symbols };
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
           stop_price, target_price, status, exit_ts, exit_price, pnl, outcome, mode, broker_order_id, asset_class)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
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
          trade.brokerOrderId ?? trade.broker_order_id ?? null,
          trade.assetClass || trade.asset_class || 'stocks',
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
    async setBrokerOrderId(id, brokerOrderId) {
      const { rows } = await pool.query(
        `UPDATE trade_journal SET broker_order_id=$2 WHERE id=$1 RETURNING *`,
        [id, brokerOrderId]
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
    async insertEvent(event) {
      const { rows } = await pool.query(
        `INSERT INTO research_events (kind, source, title, url, body, symbols, tags, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          event.kind,
          event.source,
          event.title,
          event.url || null,
          event.body || '',
          event.symbols || [],
          event.tags || [],
          event.publishedAt || event.published_at || null,
        ]
      );
      return rows[0];
    },
    async listEvents({ limit = 50, kind } = {}) {
      if (kind) {
        const { rows } = await pool.query(
          'SELECT * FROM research_events WHERE kind=$1 ORDER BY created_at DESC LIMIT $2',
          [kind, limit]
        );
        return rows;
      }
      const { rows } = await pool.query(
        'SELECT * FROM research_events ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
      return rows;
    },
    async insertIdea(idea) {
      const row = toIdeaRow(idea);
      const { rows } = await pool.query(
        `INSERT INTO strategy_ideas
          (title, hypothesis, source, slack_channel, slack_ts, status, symbols, setup_id, notes,
           school, book, track, timeframe, instrument_family, next_action, source_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [
          row.title,
          row.hypothesis,
          row.source,
          row.slack_channel,
          row.slack_ts,
          row.status,
          row.symbols,
          row.setup_id,
          row.notes,
          row.school,
          row.book,
          row.track,
          row.timeframe,
          row.instrument_family,
          row.next_action,
          row.source_url,
        ]
      );
      return rows[0];
    },
    async listIdeas({ limit = 50, status } = {}) {
      if (status) {
        const { rows } = await pool.query(
          'SELECT * FROM strategy_ideas WHERE status=$1 ORDER BY created_at DESC LIMIT $2',
          [status, limit]
        );
        return rows;
      }
      const { rows } = await pool.query(
        'SELECT * FROM strategy_ideas ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
      return rows;
    },
    async updateIdea(id, patch) {
      const ledger = ideaLedgerPatch(patch);
      const { rows } = await pool.query(
        `UPDATE strategy_ideas
         SET status=COALESCE($2, status),
             notes=COALESCE($3, notes),
             setup_id=COALESCE($4, setup_id),
             school=COALESCE($5, school),
             book=COALESCE($6, book),
             track=COALESCE($7, track),
             timeframe=COALESCE($8, timeframe),
             instrument_family=COALESCE($9, instrument_family),
             next_action=COALESCE($10, next_action),
             source_url=COALESCE($11, source_url),
             updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [
          id,
          ledger.status || null,
          ledger.notes != null ? ledger.notes : null,
          ledger.setup_id || null,
          ledger.school !== undefined ? ledger.school : null,
          ledger.book !== undefined ? ledger.book : null,
          ledger.track !== undefined ? ledger.track : null,
          ledger.timeframe !== undefined ? ledger.timeframe : null,
          ledger.instrument_family !== undefined ? ledger.instrument_family : null,
          ledger.next_action !== undefined ? ledger.next_action : null,
          ledger.source_url !== undefined ? ledger.source_url : null,
        ]
      );
      if (!rows[0]) throw new Error(`idea ${id} not found`);
      return rows[0];
    },
    async upsertCandles(bars) {
      const chunkSize = 200;
      const list = bars || [];
      for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        const values = [];
        const params = [];
        let n = 1;
        for (const bar of chunk) {
          values.push(
            `($${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++})`
          );
          params.push(
            bar.symbol,
            bar.timeframe,
            bar.ts,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume ?? 0,
            bar.sessionDate || bar.session_date || null,
            bar.minuteOfDay ?? bar.minute_of_day ?? null,
            bar.source || null
          );
        }
        await pool.query(
          `INSERT INTO candle_bars
            (symbol, timeframe, ts, open, high, low, close, volume, session_date, minute_of_day, source)
           VALUES ${values.join(',')}
           ON CONFLICT (symbol, timeframe, ts) DO UPDATE SET
             open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
             close=EXCLUDED.close, volume=EXCLUDED.volume,
             session_date=EXCLUDED.session_date, minute_of_day=EXCLUDED.minute_of_day,
             source=EXCLUDED.source, ingested_at=NOW()`,
          params
        );
      }
      return { upserted: list.length };
    },
    async listCandles({ symbol, timeframe = '5m', sessionDate, limit = 500 } = {}) {
      if (sessionDate) {
        const { rows } = await pool.query(
          `SELECT * FROM candle_bars
           WHERE symbol=$1 AND timeframe=$2 AND session_date=$3
           ORDER BY ts ASC LIMIT $4`,
          [symbol, timeframe, sessionDate, limit]
        );
        return rows;
      }
      const { rows } = await pool.query(
        `SELECT * FROM candle_bars
         WHERE symbol=$1 AND timeframe=$2
         ORDER BY ts DESC LIMIT $3`,
        [symbol, timeframe, limit]
      );
      return rows.slice().reverse();
    },
    async candleStats() {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS bars,
                COALESCE(array_agg(DISTINCT symbol) FILTER (WHERE symbol IS NOT NULL), ARRAY[]::text[]) AS symbols
         FROM candle_bars`
      );
      return { bars: rows[0]?.bars || 0, symbols: rows[0]?.symbols || [] };
    },
  };
}

module.exports = { createMemoryStore, createPgStore };
