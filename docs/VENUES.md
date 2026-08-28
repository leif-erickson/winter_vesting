# Venues

This repo is a **paper-first US equities** research loop. Execution venues are split on purpose. NinjaTrader is not used.

| Venue | Role now | Live later |
|---|---|---|
| Alpaca paper | 5m equity bars + this daily PoC | never auto-live from this repo |
| Robinhood Agentic MCP | confirm-to-place out of band, $100 cash | only after explicit per-order confirm |
| Rithmic Protocol API | stub only | ES/NQ (MES/MNQ) via Python runtime in wstrat_candlemaster, **not** NinjaTrader |
| NinjaTrader | **out** | out |

## Alpaca paper

- Market data: IEX 5-minute RTH bars (`feed=iex`, `timeframe=5Min`) when `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` are real paper keys.
- Daily PoC (`npm run paper:daily`): live data, **paper fills**. Local journal is the fill source of truth.
- Trading host is `https://paper-api.alpaca.markets`. The adapter is constructed with `paper: true`.
- `https://api.alpaca.markets` (live) and `ALPACA_LIVE=1` are **refused**. The daily/broker adapter errors out rather than silently trading live.
- Optional order mirror: `ALPACA_SUBMIT_PAPER=1` submits the paper engine's market/limit decisions to the Alpaca **paper** API and records `broker_order_id`. Default **off**. Do **not** enable in CI.

## Robinhood Agentic MCP

Live Robinhood stays hard-off in this repo (`LIVE_SWITCH = false` in `backend/lib/robinhood.js`). No Robinhood keys belong here. After a setup is `live-eligible`, Grok Bot may call Robinhood Agentic Trading MCP (review then place) only when a human confirms a **specific** order.

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
