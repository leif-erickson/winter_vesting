# Grokbot + Slack while this stack is running

Yes. This repo is the **research runtime**. Grokbot is the **operator** (Slack in, human confirm, optional Robinhood MCP). They meet over HTTP on the published API, not by embedding Grokbot in this tree.

```
Slack idea / news note
        │
        ▼
     Grokbot
        │  GET  /agent/context
        │  POST /agent/ideas
        │  POST /research/events
        ▼
 winter_vesting (Docker, :5000)
        │  paper replay / journal / walk-forward
        ▼
  Slack daily report (optional webhook)
        │
        ▼  only after a setup is live-eligible AND you confirm a specific order
 Robinhood Agentic Trading MCP
```

Live orders never originate from this API. `/trading/live/order` stays 403.

## What Grokbot should do

1. **Read state** (after `docker compose up` or `npm start`):
   `GET http://localhost:5000/agent/context`
   Returns account, named edge, asset books, frozen Oct–Nov 2025 windows, OOS setups, recent journal, events, open ideas, candle stats, and the doubling-horizon measurement (`goals.isPromotionGate` is always false).
   Also: `GET /research/edge` (no body) for the edge statement + facet budget + AMT/SMC/VSA/orderflow school map (labels and parked items, not new confirms) plus `nextToExplore`. `GET /research/board` is the books matrix, next-to-explore status queue, and OOS vs journal honesty. Never a fake setup ranking. Never live-eligible from that queue.
2. **File a Slack idea** (do not trade it):
   `POST http://localhost:5000/agent/ideas`
   ```json
   {
     "title": "Skip ORB on CPI mornings",
     "hypothesis": "Opening-range breakouts fail more on CPI. Paper a CPI-day filter.",
     "source": "slack",
     "slackChannel": "C012345",
     "slackTs": "1710000000.000100",
     "symbols": ["SPY", "QQQ"]
   }
   ```
   Status starts at `inbox`. A human (or Grokbot after you say so) patches it to `exploring` / `paper` / `rejected`.
3. **File an event** (news, sell-side note, macro like [Lyn Alden](https://www.lynalden.com/), indicator print):
   `POST http://localhost:5000/research/events`
   ```json
   {
     "kind": "macro",
     "source": "lynalden.com",
     "title": "Liquidity / fiscal regime note",
     "url": "https://www.lynalden.com/",
     "body": "Two-sentence researcher summary. Full piece stays at the URL.",
     "symbols": ["TLT", "GLD"]
   }
   ```
   Store **URL + short note**. Do not scrape paywalled full text into Postgres.
4. **Persist candles** so techniques can be re-run: `POST /research/candles/ingest`. Replay already writes 5m bars into `candle_bars`.
5. **Weekly edge:** `GET /research/edge` then, after replay, `npm run paper:weekly`. One experiment slot (`school_book`, currently `amt`). Do not add facets because last week was green. Frozen windows are holdouts — if a setup only works in Sep–Oct 2025 it is `anomaly_dependent`, not live-eligible. AMT labels (`initial_balance` / `value` / `participation`) are names for the existing three auction facets. SMC/VSA journal tags are optional ranking notes, not confirms. Orderflow stays parked (`OrderflowSession` → `NOT_IMPLEMENTED`). Gann (D/W) and Tori (4h) are swing books, not 5m facets. Next-to-explore: `GET /research/board`.

If Grokbot is not on the same machine, point it at the host LAN IP and port 5000. Set `AGENT_TOKEN` in `backend/.env` and send `Authorization: Bearer …` or `X-Agent-Token`.

## What Grokbot must not do

- Place a live Robinhood order because a Slack message was enthusiastic.
- Treat `GOAL_DOUBLE_DAYS` or a doubling curve as a reason to size up.
- Promote a setup off in-sample P&amp;L. Only walk-forward OOS gates **and** a passing holdout (not `anomaly_dependent`) in `backend/lib/config.js` / `backend/lib/validate.js` mark `live-eligible`, and even then fills stay paper until you confirm a **specific** MCP order.
- Turn SMC/VSA `researchTags` or a parked orderflow stub into extra entry confirms. The named edge stays 15m OR + VWAP + rvol.
- File Gann or Tori math as a 5m live facet. They are swing books. Do not implement detectors from this pass.
- Stack two `school_book`s in one experiment slot, compute SQN on n&lt;30, size live from SQN, or use a confluence score (TradePad 0–14).
- Promote live-eligible from `GET /research/board` / `nextToExplore`.
- Invent a setup ranking (there is no `GET /trading/rankings`). Do not treat journal fills as OOS or as “most-profitable.”

## Slack wiring

Outbound already exists: the weekday Action can POST `backend/reports/latest.md` to `SLACK_WEBHOOK_URL`.

Inbound is Grokbot’s job: listen on the research channel, classify “idea” vs “event”, POST here, reply in-thread with the idea id and a reminder that it is paper until replay + journal review.

Named edge, four books, AMT label map, Gann/Tori swing books, parked orderflow, and the Oct–Nov 2025 holdout: [STRATEGY.md](STRATEGY.md). Research ledger: [RESEARCH.md](RESEARCH.md).
