# Stock market tracker + paper day-trading

PostgreSQL + Express + React portfolio tracker, plus a **paper-first US equities day-trading loop**: 5-minute RTH signals (RSI, VWAP, opening range, relative volume), a durable Postgres journal, walk-forward ranking, and a promotion gate. Live Robinhood execution is a stub and is hard-off.

A weekday GitHub Action runs the same paper engine against **live Alpaca market data** after the cash close (`npm run paper:daily`). Fills stay paper. This is a PoC of "live running, paper fills" — not live money trading.

This is research software, not financial advice. Most retail day-trading systems lose money.

Venue split (Alpaca paper / Robinhood MCP / Rithmic stub / **NinjaTrader out**): [docs/VENUES.md](docs/VENUES.md).

## Safety

`main`'s `backend/index.js` previously had an obfuscated EtherHiding malware payload appended after `app.listen`. That payload is **removed**. Do not run untrusted copies of `backend/index.js`. There is a regression test that the file stays clean.

Live trading never runs from this repo:

- The Robinhood adapter always refuses. After a setup is marked `live-eligible`, Grok Bot may call **Robinhood Agentic Trading MCP** (review then place) only when you confirm a **specific** order. No Robinhood API keys belong here.
- Alpaca is **paper-only** (`paper: true`, `https://paper-api.alpaca.markets`). `https://api.alpaca.markets` and `ALPACA_LIVE=1` are refused — the daily/broker adapter errors out rather than silently trading live.
- **NinjaTrader is not used.** Do not add NT8, NinjaScript, NT connections, or NT routing. wstrat_candlemaster treats NT as Strategy Analyzer only; live there is Python on Rithmic.
- Rithmic in this repo is a **stub**. No live futures orders. Live ES/NQ (MES/MNQ) belongs in the wstrat_candlemaster Python runtime after R|Protocol conformance.

## Quick start (paper locally)

Reuse Docker Postgres + Node if you already have them:

```bash
docker compose up -d          # Postgres 5432, pgAdmin 8080 (admin@example.com / admin)
cp backend/.env_template backend/.env
# Optional: set ALPACA_API_KEY / ALPACA_SECRET_KEY for real 5m bars.
# Without keys, scan/replay degrade to deterministic synthetic RTH bars.
# paper:daily does *not* degrade — it exits non-zero without real keys.

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
npm run paper:daily     # latest completed RTH session on live Alpaca data (fail-closed)
```

Default universe (override with `DAYTRADE_UNIVERSE`): `SOFI,BRK.B,TSLA,AMZN,ARKK,MSFT,NVDA,PLTR`.

## Alpaca paper keys (data + optional paper-order mirror)

Mint **paper** keys, not live:

1. Log in at [https://app.alpaca.markets/account/login](https://app.alpaca.markets/account/login)
2. Choose the **Paper Trading** dropdown (not Live)
3. **API Keys → Generate**
4. Copy the secret immediately — Alpaca shows it once

Put them in `backend/.env` as `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` (never commit `.env`). For the weekday Action, add the same names as GitHub Actions secrets, plus optional `SLACK_WEBHOOK_URL` (Incoming Webhook). **Do not paste keys in Slack.**

`ALPACA_SUBMIT_PAPER=1` mirrors paper fills to the Alpaca paper API (`https://paper-api.alpaca.markets`) and records `broker_order_id`. Default **off**; local journal is the fill source of truth. Do **not** turn this on in CI.

## Daily live-data paper PoC

Weekdays after the US cash close, [`.github/workflows/paper-daily.yml`](.github/workflows/paper-daily.yml) runs `cd backend && npm ci && npm run paper:daily`.

- Cron: `30 20 * * 1-5` (20:30 UTC ≈ 4:30pm America/New_York on **EDT**). During **EST** that is 3:30pm ET, before the close — DST caveat documented in the workflow.
- Requires secrets `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`. Missing keys or Alpaca bar failure **fails the job** (no synthetic fallback). Until those secrets exist, fail-closed is correct.
- No database required (in-memory journal). Walk-forward one-liners are skipped without Postgres.
- Writes Slack-markdown to stdout and `backend/reports/latest.md` (gitignored). Uploads that file as artifact `paper-daily` and appends it to `$GITHUB_STEP_SUMMARY`.
- If `SLACK_WEBHOOK_URL` is set, POSTs the report text to the Incoming Webhook. If absent, skips Slack quietly. The webhook is never echoed.
- Flatten-by-close remains the paper risk model. No live orders. `liveEnabled: false`.
- Optional read-only GET of the Alpaca **PAPER** account (equity, cash, buying power, positions count) when reachable.

NinjaTrader is not part of this workflow. Rithmic is not part of this workflow.

## How the paper system works

1. **Bars.** 5-minute regular-hours (09:30–16:00 ET) OHLCV from Alpaca when keys work; `scan` / `replay` otherwise use synthetic sessions that still exercise the same methods. `paper:daily` never uses synthetic bars.
2. **Signals.** Three research methods, long-only to match a cash account:
   - `orb_breakout` — 15-minute opening-range breakout, close above VWAP, relative volume ≥ 1.2
   - `vwap_rsi_reversion` — RSI oversold, reclaim of session VWAP on volume
   - `orb_retest` — after an OR breakout, pullback to OR mid / VWAP and resume
3. **Risk.** Model the Agentic account as **$100 cash, no options**. A single name is capped at 25% of that ($25), using fractional shares for high-priced names. At most one open position. Daily-loss kill switch. Flatten before the close. **Sold proceeds are unsettled (T+1) and not reusable the same session.**
4. **Journal.** Every paper fill is written to `trade_journal` (symbol, timestamp, side, features/reason, paper price, size, outcome when known). Optional nullable `broker_order_id` if Alpaca paper submit is on.
5. **Learning.** Rolling walk-forward (5 sessions in-sample / 2 out-of-sample). Setups are ranked on OOS P&amp;L, win rate, consistency (share of profitable OOS folds), and drawdown. A setup becomes **live-eligible** only if it clears `PROMOTION_GATES` in `backend/lib/config.js`. Everything still executes as paper. Live Robinhood stays off.

Borrowed (non-binding) ideas from [wstrat_candlemaster](https://github.com/leif-erickson/wstrat_candlemaster): candle/ORB features, walk-forward as the real gate, journal + promote. That project is ES/NQ futures with Rithmic routing — **not copied**, and **not NinjaTrader**.

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

Covers indicator math, signal detection, journal writes, ranking/promotion gates, the live switch staying off, the daily report formatter, Alpaca paper refusing live URLs, the Rithmic stub never placing, and an end-to-end synthetic replay.

## Layout

```
backend/lib/config.js      universe, $100 risk, promotion gates
backend/lib/indicators.js  RSI, VWAP, opening range, relative volume
backend/lib/signals.js     setup detectors
backend/lib/paper.js       sizing, T+1 cash, kill switch
backend/lib/store.js       Postgres + in-memory journal
backend/lib/rank.js        walk-forward OOS rank + promote
backend/lib/robinhood.js   live stub, LIVE_SWITCH = false
backend/lib/alpacaPaper.js paper-only Alpaca client + optional submit
backend/lib/rithmic.js     Rithmic stub (no live orders, no NT)
backend/lib/daily.js       weekday live-data paper runner
backend/lib/dailyReport.js Slack-markdown daily report
backend/lib/pipeline.js    replay / scan / one-session simulate
backend/cli.js             paper CLI (replay|scan|rank|daily)
docs/VENUES.md            venue split (NT out)
frontend/src/App.js       signals, P&L, setups, journal, "why"
```
