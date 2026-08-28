# Stock market tracker + paper day-trading

PostgreSQL + Express + React portfolio tracker, plus a **paper-first US equities day-trading loop**: 5-minute RTH signals (RSI, VWAP, opening range, relative volume), a durable Postgres journal, walk-forward ranking, and a promotion gate. Live Robinhood execution is a stub and is hard-off.

This is research software, not financial advice. Most retail day-trading systems lose money.

## Safety

`main`'s `backend/index.js` previously had an obfuscated EtherHiding malware payload appended after `app.listen`. That payload is **removed**. Do not run untrusted copies of `backend/index.js`. There is a regression test that the file stays clean.

Live trading never runs from this repo. The Robinhood adapter always refuses. After a setup is marked `live-eligible`, Grok Bot may call **Robinhood Agentic Trading MCP** (review then place) only when you confirm a **specific** order. No Robinhood API keys belong here.

## Quick start (paper locally)

Reuse Docker Postgres + Node if you already have them:

```bash
docker compose up -d          # Postgres 5432, pgAdmin 8080 (admin@example.com / admin)
cp backend/.env_template backend/.env
# Optional: set ALPACA_API_KEY / ALPACA_SECRET_KEY for real 5m bars.
# Without keys the engine degrades to deterministic synthetic RTH bars.

cd backend && npm ci && npm test && npm start
# other terminal
cd frontend && npm ci && npm start   # http://localhost:3000
```

pgAdmin: host `db` (or `localhost` from the host), user `user`, password `password`, database `portfolio_db`.

Cloud / native Postgres (no nested Docker): `.cursor/install.sh` and `.cursor/start.sh` install and start a local cluster with the same credentials. Ports in `.cursor/environment.json` are objects (`frontend` 3000, `backend` 5000).

### Paper CLI (no UI required)

```bash
cd backend
npm run paper:replay    # 20 sessions, journal trades, rank/promote
npm run paper:scan      # latest-session signals + "why this trade"
npm run paper:rank      # walk-forward OOS table
```

Default universe (override with `DAYTRADE_UNIVERSE`): `SOFI,BRK.B,TSLA,AMZN,ARKK,MSFT,NVDA,PLTR`.

## How the paper system works

1. **Bars.** 5-minute regular-hours (09:30–16:00 ET) OHLCV from Alpaca when keys work; otherwise synthetic sessions that still exercise the same methods.
2. **Signals.** Three research methods, long-only to match a cash account:
   - `orb_breakout` — 15-minute opening-range breakout, close above VWAP, relative volume ≥ 1.2
   - `vwap_rsi_reversion` — RSI oversold, reclaim of session VWAP on volume
   - `orb_retest` — after an OR breakout, pullback to OR mid / VWAP and resume
3. **Risk.** Model the Agentic account as **$100 cash, no options**. A single name is capped at 25% of that ($25), using fractional shares for high-priced names. At most one open position. Daily-loss kill switch. Flatten before the close. **Sold proceeds are unsettled (T+1) and not reusable the same session.**
4. **Journal.** Every paper fill is written to `trade_journal` (symbol, timestamp, side, features/reason, paper price, size, outcome when known).
5. **Learning.** Rolling walk-forward (5 sessions in-sample / 2 out-of-sample). Setups are ranked on OOS P&amp;L, win rate, consistency (share of profitable OOS folds), and drawdown. A setup becomes **live-eligible** only if it clears `PROMOTION_GATES` in `backend/lib/config.js`. Everything still executes as paper. Live Robinhood stays off.

Borrowed (non-binding) ideas from [wstrat_candlemaster](https://github.com/leif-erickson/wstrat_candlemaster): candle/ORB features, walk-forward as the real gate, journal + promote. That project is ES/NQ futures with Rithmic/NinjaTrader routing — not copied.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/trading/account` | Paper cash / positions |
| GET | `/trading/journal` | Recent journal rows |
| GET | `/trading/setups` | Ranked setups, paper vs live-eligible |
| GET | `/trading/signals` | Latest-session signals |
| GET | `/trading/pnl` | Paper P&amp;L |
| POST | `/trading/replay` | Run the paper pipeline into Postgres |
| POST | `/trading/scan` | Signal scan without placing |
| POST | `/trading/live/order` | Always 403 — Robinhood stub |
| GET/POST/DELETE | `/portfolio` | Original holdings CRUD |

## Tests

```bash
cd backend && npm test
```

Covers indicator math, signal detection, journal writes, ranking/promotion gates, the live switch staying off, and an end-to-end synthetic replay.

## Layout

```
backend/lib/config.js      universe, $100 risk, promotion gates
backend/lib/indicators.js  RSI, VWAP, opening range, relative volume
backend/lib/signals.js     setup detectors
backend/lib/paper.js       sizing, T+1 cash, kill switch
backend/lib/store.js       Postgres + in-memory journal
backend/lib/rank.js        walk-forward OOS rank + promote
backend/lib/robinhood.js   live stub, LIVE_SWITCH = false
backend/lib/pipeline.js    replay / scan
backend/cli.js             paper CLI
frontend/src/App.js       signals, P&L, setups, journal, "why"
```
