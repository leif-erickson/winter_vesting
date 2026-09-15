# Venues

This repo is a **paper-first US equities** research loop. Execution venues are split on purpose. NinjaTrader is not used.

| Venue | Role now | Live later |
|---|---|---|
| Alpaca paper | 5m equity bars + this daily PoC | never auto-live from this repo |
| Robinhood Agentic MCP | confirm-to-place out of band, $100 cash | only after explicit per-order confirm |
| Rithmic Protocol API | stub only | ES/NQ (MES/MNQ) via Python runtime in wstrat_candlemaster, **not** NinjaTrader |
| NinjaTrader | **out** | out |

Asset books (stocks / crypto / futures / options) and the named stock-auction edge: [STRATEGY.md](STRATEGY.md). Crypto and options have **no fill engine** in this repo this pass. Futures live stays on wstrat_candlemaster / Rithmic.

## Alpaca paper

- Market data: IEX 5-minute RTH bars (`feed=iex`, `timeframe=5Min`) when `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` are real paper keys.
- Daily PoC (`npm run paper:daily`): live data, **paper fills**. Local `trade_journal` stays the research fill source of truth. In addition, fills are **POSTed** to the Alpaca paper trading API so the paper account is not idle.
- Trading host is `https://paper-api.alpaca.markets`. The adapter is constructed with `paper: true`.
- `https://api.alpaca.markets` (live) and `ALPACA_LIVE=1` are **refused**. The daily/broker adapter errors out rather than silently trading live.
- Paper broker POSTs default **on** (`PAPER_BROKER_ORDERS` / `ALPACA_SUBMIT_PAPER`). Opt out with `PAPER_BROKER_ORDERS=false` or `ALPACA_SUBMIT_PAPER=0`. Orders use a deterministic `client_order_id` (journal identity) so a re-run does not double-POST. `broker_order_id` and `client_order_id` are stored on the journal row.
- `paper:replay` stays **journal-only** (no Alpaca POSTs). Do not wire replay to the paper brokerage — a 90-day replay would dump historical fills onto today's paper account.
- Sizing still follows the $100 cash / T+1 / no-short / flatten-by-close model. POSTs are the same fractional long + flatten sells, not a live-money path.

## Robinhood Agentic MCP

Live Robinhood stays hard-off in this repo (`LIVE_SWITCH = false` in `backend/lib/robinhood.js`). No Robinhood keys belong here. After a setup is `live-eligible`, Grokbot may call Robinhood Agentic Trading MCP (review then place) only when a human confirms a **specific** order. Slack ideas enter through `POST /agent/ideas` as hypotheses — see [GROKBOT.md](GROKBOT.md). The $100 cash model is a research budget; it may change and is likely not the live account.

## Rithmic (stub)

`backend/lib/rithmic.js` is a JS stub. It reads the same env names as wstrat_candlemaster `.env.example`:

- `RITHMIC_USER`
- `RITHMIC_PASSWORD`
- `RITHMIC_SYSTEM_NAME` (default `Rithmic Test`)
- `RITHMIC_APP_NAME` (default `stock_market`)
- `RITHMIC_APP_VERSION`
- `RITHMIC_URL` (default `rituz00100.rithmic.com:443`)

`status()` always reports `live: false`, `dryRun: true`. `submitOrder()` always throws:

> Rithmic live is not enabled in stock_market; use wstrat_candlemaster runtime after conformance. NinjaTrader is not a routing path.

Live Rithmic requires broker conformance on R|Protocol. Grok Bot must emit a signed intent the candlemaster runtime executes. **This repo does not speak Rithmic plants directly yet.** Do not copy wstrat_candlemaster into this tree. There is no Python/`async_rithmic` dependency here.

## NinjaTrader

**Out.** Do not add NT8, NinjaScript, NT connections, or NT routing. wstrat_candlemaster already treats NinjaTrader as Strategy Analyzer only; live there is Python on Rithmic. Honor that split.
