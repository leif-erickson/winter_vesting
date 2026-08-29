# Strategy

Paper-first US equity research. Alpaca paper is the stock book. Live Robinhood stays confirm-to-place and out of band. This is not financial advice.

Research books, next-to-explore, Drive pointers: [RESEARCH.md](RESEARCH.md). `GET /research/board` is the queryable ledger.

## Named edge

**Stock auction:** 15-minute opening range + VWAP as fair value + relative volume on high-beta names; flatten by close.

That is three facets. Auction Market Theory **is** those three facets (initial balance / value / participation). It is not an AI narrative, not Gann, and not a 12-factor score.

**What would kill it:** OOS P&amp;L concentrated in one expansion window (Sep–Oct 2025 Nasdaq melt-up) that fails in the Nov 2025 holdout; or consistency collapsing when the regime is `reset`.

**What maintains it weekly:** keep the same 2–5 facets; change *where* a setup may fire (instrument family + regime). One experiment slot from the Grokbot inbox. Do not add facets because last week was green.

## Facet budget

Every setup declares **2–5 named facets** (`maxFacets: 5` in `backend/lib/config.js`). Detectors that exceed the budget fail a unit test. Journal `features` store those names plus price/time, plus AMT labels (`features.amt`) on the same facets. Event-days (CPI / FOMC / mega-cap earnings) are an optional **skip**, not a sixth confirm. SMC/VSA `researchTags` are optional notes, not confirms. Books can be many; a setup still cannot grow past 5 facets.

| Setup | Family | Facets | Where it may fire |
|---|---|---|---|
| `orb_breakout` | auction | or_break, above_vwap, rvol | high-beta |
| `orb_retest` | auction | prior_or_break, mid_vwap_touch, rvol | high-beta |
| `vwap_rsi_reversion` | mean_reversion | vwap_reclaim, rsi, rvol | slow large-cap |
| `bar_reversal` | reversal | pin_or_engulf, at_vwap, rvol | both |
| `impulse_hold` | vol_expansion | or_or_structure_break, above_vwap, rvol | expansion regime only |
| `roundtrip_fade` | vol_reset | extension_from_high, vwap_loss_or_engulf, rvol | reset regime only; SELL signal — cash book does not short |

High-beta: `SOFI, PLTR, TSLA, ARKK, NVDA, QQQ`. Slow large-cap: `MSFT, AMZN, BRK.B`.

Only `orb_breakout` has a walk-forward OOS path so far (**n=2**). Unmeasured. Do not compute SQN. If OOS n&lt;8 (`minOosTrades`), status is **unmeasured**, not most profitable.

## Candle model

`Candle` and `Session` in `backend/lib/candle.js` own geometry (range, wicks, pin, engulf) and session series (OR, VWAP, RSI, swings). Detectors stay functions. `OrderflowSession` throws `NOT_IMPLEMENTED` — no fake CVD from candle color.

## Industrial school mapping (paper labels)

AMT is a **label map** on the named edge, not a 4th/5th/6th confirm. `backend/lib/schools.js` writes those labels onto journal/signal `features`. Detectors still fire only on the same 2–5 named facets.

| Existing facet | AMT label | Meaning |
|---|---|---|
| `or_break`, `prior_or_break`, `or_or_structure_break` | `initial_balance` | 15-minute opening range ≈ initial balance |
| `above_vwap`, `mid_vwap_touch`, `at_vwap`, `vwap_reclaim`, `vwap_loss_or_engulf` | `value` | session VWAP ≈ auction value |
| `rvol` | `participation` | relative volume |

Unmapped facets (`rsi`, `pin_or_engulf`, `extension_from_high`) stay unlabeled. AMT role names are **not** entry facets.

**SMC** (`liquidity_sweep`, `fvg`, `order_block`, `bos`) and **VSA** (`effort_vs_result`, `no_demand`) may appear as optional `features.researchTags` for later ranking. They are coarse 5m-OHLCV notes, not a full SMC/VSA engine, and they **do not gate entries**. A signal still fires when those tags are absent. Do not promote them into confirms because a week was green. SMC/orderflow stay instrument-specific later books if ever.

**Orderflow** (footprint / delta / DOM / CVD) stays parked. `OrderflowSession` throws `NOT_IMPLEMENTED`. Do not invent tick or L2 from 5m OHLCV. NinjaTrader stays out. Rithmic stays a stub.

**Gann** is unparked as `track=tia_gann_swing`: mechanical swing-chart trend following (**not** Square of 9). D/W TIA book. Not a 6th 5m ORB facet. Official and Drive ids: [RESEARCH.md](RESEARCH.md). No detector this pass.

**Tori trendlines** is `track=tori_trendline` (Victoria Duke / ToriTradez LLC). Official: [toritradez.com](https://toritradez.com/) and [TradeZella trendline-strategy](https://www.tradezella.com/strategies/trendline-strategy). 4H workhorse — do not drop below 4H. Public tape: platinum and crude (also gold). Skip Scribd PDFs and FX Replay extras. Not stacked on 5m ORB or on Gann.

**Brooks** 5m Always-In / H2 is a possible later day-trade slot, not this week’s experiment.

**One `school_book` per experiment slot:** `amt` | `brooks` | `tori` | `gann` | `ict_smc` | `orderflow`. Never stack. Overnight path: pick `tia_gann_swing` **or** `tori_trendline`. A later 4H cross-method comparison is a study, never stacked confirms.

TIME analysis masterclasses overlay *when*. The 18.6-year LAND cycle is a macro regime (whether books are open), not a 15m trigger.

ICT/SMC and orderflow are later ES/NQ + L2 books, not the default US-cash book.

## Validation

Walk-forward OOS (5 sessions in / 2 out) is **necessary and not sufficient**.

1. Purged gap: embargo 1 session around frozen event dates so a train fold’s last bar is not the same event as the test fold’s first bar.
2. Frozen anomaly windows — **never fit params here**:
   - `2025-09-01` → `2025-10-31` — Nasdaq expansion (late-Oct highs, AI/tech leadership).
   - `2025-11-01` → `2025-11-21` — tech round-trip (incl. 2025-11-20 Nvidia open-drive reversal).
3. Regime scorecard: `quiet` / `expansion` / `reset`. If ≥50% of gross P&amp;L is expansion and reset is flat or negative, the edge is trend-beta — do not promote.
4. Variant tax: if more than 10 setup variants were tried, require extra OOS trades.
5. Anomaly concentration: if gates fail when Oct–Nov 2025 is removed, status stays `paper` with `anomaly_dependent`.

Doubling-horizon (`GOAL_DOUBLE_DAYS`) is a **measurement**, never a promotion gate.

## Four asset books

| Book | Research here | Live | Notes |
|---|---|---|---|
| Stocks | Alpaca 5m paper | Robinhood MCP confirm-to-place after OOS | $100 cash, no options, flatten-by-close |
| Crypto | config + `asset_class`; ccxt portfolio quotes | never from this repo | Nasdaq-beta glance (BTC/ETH) |
| Futures | Rithmic stub; paper stats later | wstrat_candlemaster after R\|Protocol | NinjaTrader is out |
| Options | research note / IV hypothesis | not on $100 RH cash | defined-risk; no fill engine this pass |

Same economic event, different books. Do not stack QQQ + NQ + BTC as extra confirms on one stock trigger.

Overnight / higher-TF swing is **`tia_gann_swing` (D/W) or `tori_trendline` (4H min)** — one track per slot, not extra 5m facets. See [RESEARCH.md](RESEARCH.md).

## Weekly maintenance

`npm run paper:weekly` writes `backend/reports/weekly.md`:

1. Named edge (from config, not improvised).
2. This sample’s OOS vs regime mix.
3. Frozen-window P&amp;L share.
4. Kill / park / promote per family (`live-eligible` only if gates clear **and** not `anomaly_dependent`).
5. One experiment slot: one `school_book` (`amt` this week). Newest `strategy_ideas` in `inbox` / `exploring` that does not stack schools.
6. Cross-asset glance (QQQ vs NQ vs BTC).

Weekday `paper:daily` is the tape. Weekly is where the edge is **maintained**. Next-to-explore ranking lives on `GET /research/board` and does not promote live-eligible.

## Parked

- Real CVD / tick / Lee-Ready (orderflow parked; no fake CVD from candle color)
- Gann / Tori **detectors** (books are unparked; geometry later)
- Promoting SMC/VSA `researchTags` into entry facets
- Live options or futures from this repo
- Flipping `LIVE_SWITCH`
