# Winter vesting

Research runtime for **exploring US equity strategies**. Alpaca **paper** is the venue for now. Live Robinhood Agentic Trading is a possible later path on a **small cash budget** (modeled at $100 here; that may increase, and this is likely **not** the live account). This is not financial advice. Most retail day-trading systems lose money.

The loop is self-directed: file a hypothesis → persist candles and context (news, analysis, macro) → paper-trade the idea → journal the “why” → review OOS → keep, change, or kill. Doubling capital is a **measurement**, not a promotion gate. Walk-forward out-of-sample results are the gate. That is how this repo avoids fitting noise.

Strategy (facet budget, books, Oct–Nov 2025 holdout, weekly edge): [docs/STRATEGY.md](docs/STRATEGY.md). Research ledger (next-to-explore, Drive pointers): [docs/RESEARCH.md](docs/RESEARCH.md). Venue split (Alpaca paper / Robinhood MCP / Rithmic stub / **NinjaTrader out**): [docs/VENUES.md](docs/VENUES.md). Grokbot + Slack while this stack is running: [docs/GROKBOT.md](docs/GROKBOT.md).

## Intent

- **Paper first.** Alpaca paper data and paper fills. `https://api.alpaca.markets` and `ALPACA_LIVE=1` are refused.
- **Tiny live later, maybe.** After a setup is `live-eligible`, Grokbot may call Robinhood Agentic Trading MCP only when you confirm a **specific** order. No Robinhood keys belong here. $100 is a research budget; do not assume it is the right funded account.
- **Track context that might actually matter.** News, current analysis, and slower macro (for example notes citing [lynalden.com](https://www.lynalden.com/) on liquidity / fiscal regime). Store a URL plus a short note — not a paywalled reprint.
- **Track candles and techniques.** Persist 5-minute RTH bars, run methods with a **2–5 facet** budget (ORB, VWAP, RSI, relative volume, bar reversal, expansion hold / reset fade), and write every paper fill to the journal with features and a reason so you can review and improve. Frozen Oct–Nov 2025 windows are holdouts, not fit sets.
- **Self-directed exploration.** Slack ideas can land here via Grokbot as `inbox` hypotheses. They are not trades.
- **Goals without overfitting.** Default aspiration is 2× starting cash in **365** days (`GOAL_DOUBLE_DAYS`). Horizons under ~90 days are flagged as overfitting bait. Promotion still requires `PROMOTION_GATES` (OOS trades, win rate, P&amp;L, consistency, drawdown). In-sample doubling that OOS does not confirm is also flagged.

## Safety

`main`'s `backend/index.js` previously had an obfuscated EtherHiding malware payload appended after `app.listen`. That payload is **removed**. Do not run untrusted copies of `backend/index.js`. There is a regression test that the file stays clean.

Live trading never runs from this repo:

- The Robinhood adapter always refuses. After a setup is marked `live-eligible`, Grokbot may call **Robinhood Agentic Trading MCP** (review then place) only when you confirm a **specific** order.
- Alpaca is **paper-only** (`paper: true`, `https://paper-api.alpaca.markets`).
- **NinjaTrader is not used.** Do not add NT8, NinjaScript, NT connections, or NT routing.
- Rithmic in this repo is a **stub**. Live ES/NQ belongs in the wstrat_candlemaster Python runtime after R|Protocol conformance.

## Quick start

The whole stack runs in Docker (Postgres 18-alpine, API, UI, pgAdmin):

```bash
cp backend/.env_template backend/.env
# Optional: set ALPACA_API_KEY / ALPACA_SECRET_KEY for real 5m bars.
# Without keys, scan/replay degrade to deterministic synthetic RTH bars.
# paper:daily does *not* degrade — it exits non-zero without real keys.

docker compose up --build
```

UI: http://localhost:3000 · API: http://localhost:5000 · pgAdmin: http://localhost:8080 (admin@example.com / admin).

Host-side Node still works against the published Postgres port:

```bash
cd backend && npm ci && npm test && npm start
# other terminal
cd frontend && npm ci && npm start   # http://localhost:3000, proxies API to :5000
```

`backend/.env` must use `DB_USER=user` / `DB_PASSWORD=password` / `DB_HOST=localhost` to match Compose. The backend container overrides `DB_HOST=db`.

pgAdmin: host `db` (or `localhost` from the host), user `user`, password `password`, database `portfolio_db`.

### Paper CLI

```bash
cd backend
npm run paper:replay    # ~90 calendar days of Alpaca history; append/upsert journal + candles
npm run paper:replay -- --reset   # rare full rebuild (wipes trade_journal)
npm run paper:scan      # latest-session signals + "why this trade"
npm run paper:rank      # walk-forward OOS from existing journal (does not delete fills)
npm run paper:daily     # latest completed RTH session on live Alpaca data (fail-closed)
npm run paper:weekly    # named edge, OOS, anomaly flags, one experiment slot
```

Default universe (override with `DAYTRADE_UNIVERSE`): `SOFI,BRK.B,TSLA,AMZN,ARKK,MSFT,NVDA,PLTR`.

## Alpaca paper keys

Mint **paper** keys, not live:

1. Log in at [https://app.alpaca.markets/account/login](https://app.alpaca.markets/account/login)
2. Choose the **Paper Trading** dropdown (not Live)
3. **API Keys → Generate**
4. Copy the secret immediately — Alpaca shows it once

Put them in `backend/.env` as `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` (never commit `.env`). For the weekday Action, add the same names as GitHub Actions secrets, plus optional `SLACK_WEBHOOK_URL`. **Do not paste keys in Slack.**

`ALPACA_SUBMIT_PAPER=1` mirrors paper fills to the Alpaca paper API and records `broker_order_id`. Default **off**; local journal is the fill source of truth. Do **not** turn this on in CI.

## Daily live-data paper PoC

Weekdays after the US cash close, [`.github/workflows/paper-daily.yml`](.github/workflows/paper-daily.yml) runs `cd backend && npm ci && npm run paper:daily`.

- Cron: `30 20 * * 1-5` (20:30 UTC ≈ 4:30pm America/New_York on **EDT**). During **EST** that is 3:30pm ET, before the close — DST caveat documented in the workflow.
- Requires secrets `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`. Missing keys or Alpaca bar failure **fails the job** (no synthetic fallback).
- No database required (in-memory journal). Walk-forward one-liners are skipped without Postgres.
- Writes Slack-markdown to stdout and `backend/reports/latest.md` (gitignored).
- If `SLACK_WEBHOOK_URL` is set, POSTs the report. The webhook is never echoed.
- Flatten-by-close remains the paper risk model. No live orders.

## How the paper system works

1. **Bars.** 5-minute regular-hours (09:30–16:00 ET) OHLCV from Alpaca when keys work; `scan` / `replay` otherwise use synthetic sessions. Replay also upserts bars into `candle_bars`. `paper:daily` never uses synthetic bars.
2. **Signals.** Long-only cash fills. High-beta names run auction setups; slow large-cap runs VWAP reclaim. See [docs/STRATEGY.md](docs/STRATEGY.md).
   - `orb_breakout` / `orb_retest` — 15-minute opening range, VWAP, relative volume (AMT: initial_balance / value / participation)
   - `vwap_rsi_reversion` — RSI oversold, reclaim of session VWAP on volume (slow large-cap)
   - `bar_reversal` — pin or engulf at VWAP
   - `impulse_hold` — continuation in an `expansion` regime only
   - `roundtrip_fade` — SELL signal in a `reset` regime; the cash book does not short
3. **Risk.** Model the account as **$100 cash, no options**. A single name is capped at 25% of that ($25), using fractional shares. At most one open position. Daily-loss kill switch. Flatten before the close. **Sold proceeds are unsettled (T+1) and not reusable the same session.**
4. **Journal.** Every paper fill is written to `trade_journal` (symbol, timestamp, side, features/reason, paper price, size, `asset_class`, outcome when known). Default replay and daily persist **append / upsert** (identity: symbol + ts + setup + side). `paper:rank` never deletes the journal. Use `--reset` only to rebuild. Sample growth is historical Alpaca lookback plus daily paper fills.
5. **Context.** `research_events` holds news / analysis / macro / indicator notes. `strategy_ideas` holds Slack/Grokbot/UI hypotheses until you paper them or reject them.
6. **Learning.** Rolling walk-forward (5 sessions in-sample / 2 out-of-sample) **and** holdout on frozen Oct–Nov 2025 windows. A setup becomes **live-eligible** only if it clears `PROMOTION_GATES` and is not `anomaly_dependent`. Everything still executes as paper.

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
| GET | `/research/edge` | Named edge, facet budget, frozen windows, asset books, next-to-explore |
| GET | `/research/board` | Books matrix, next-to-explore status queue, OOS vs journal honesty (never a fake setup ranking; never live-eligible) |
| GET | `/research/goals` | Doubling-horizon measurement (not a gate) |
| GET/POST | `/research/events` | News / analysis / macro / indicator notes |
| GET/POST/PATCH | `/research/ideas` | Strategy hypotheses (+ `nextToExplore`) |
| GET | `/research/candles` | Persisted 5m bars |
| POST | `/research/candles/ingest` | Pull and store latest bars |
| GET | `/agent/context` | Snapshot for Grokbot |
| POST | `/agent/ideas` | Slack/Grokbot idea intake |
| GET/POST/DELETE | `/portfolio` | Original holdings CRUD |

If `AGENT_TOKEN` is set, mutating `/agent/*` and research writes require `Authorization: Bearer …`.

## Tests

```bash
cd backend && npm test
```

Covers indicator math, candle/session geometry, signal detection (including regime-gated families), journal writes, ranking/promotion gates, holdout / `anomaly_dependent` blocks, weekly edge report, goal/overfit flags, research events/ideas/candles, the live switch staying off, the daily report formatter, Alpaca paper refusing live URLs, the Rithmic stub never placing, and an end-to-end synthetic replay.

## Layout

```
backend/lib/config.js      universe, facets, named edge, asset books, promotion gates
backend/lib/schools.js     AMT labels on existing facets; optional SMC/VSA journal tags; Gann/Tori swing books; orderflow parked
backend/lib/candle.js      Candle / Session geometry (OrderflowSession stub)
backend/lib/regime.js      frozen Oct–Nov 2025 windows, expansion/reset/quiet
backend/lib/validate.js    holdout metrics, anomaly_dependent
backend/lib/goals.js       doubling-horizon math (not a gate)
backend/lib/research.js    event/idea/candle helpers + next-to-explore status queue
backend/lib/researchBoard.js  books matrix, catalog ideas, verified paper-sample honesty for GET /research/board
backend/lib/agent.js       Grokbot context snapshot
backend/lib/indicators.js  RSI, VWAP, opening range, relative volume
backend/lib/signals.js     setup detectors
backend/lib/paper.js       sizing, T+1 cash, kill switch
backend/lib/store.js       Postgres + in-memory journal / research
backend/lib/rank.js        walk-forward OOS rank + promote
backend/lib/robinhood.js   live stub, LIVE_SWITCH = false
backend/lib/alpacaPaper.js paper-only Alpaca client + optional submit
backend/lib/rithmic.js     Rithmic stub (no live orders, no NT)
backend/lib/daily.js       weekday live-data paper runner
backend/lib/dailyReport.js Slack-markdown daily report
backend/lib/weekly.js      weekly named-edge report
backend/lib/pipeline.js    replay / scan / candle persist
backend/cli.js             paper CLI (replay|scan|rank|daily|weekly)
docs/STRATEGY.md          facet rule, books, validation, weekly edge
docs/RESEARCH.md          books matrix, next-to-explore, Drive pointers
docs/VENUES.md            venue split (NT out)
docs/GROKBOT.md           Slack / Grokbot HTTP contract
frontend/src/App.js       signals, P&L, setups, journal
frontend/src/ResearchDesk.js  named edge, events, ideas, goals, candle ingest
```
