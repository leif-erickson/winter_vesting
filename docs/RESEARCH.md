# Research ledger

Paper-only. Live stays off. This file is the human picker; `GET /research/board` is the agent query.

Do not copy TIA, Tori, Brooks, or other course text into this repo. Pointers by Drive id / URL only. Do not add facets. Do not size live from SQN.

## Honesty

Paper only. Live stays off. This board never marks `live-eligible`. **Do not invent a ranking.** Journal fills are **unmeasured**, not “most-profitable.”

Verified sample: **2026-08-10 → 2026-08-28** paper replay (leif API). Frozen 2025 holdout windows are outside this sample, so anomaly share cannot be scored here.

### Account

Start $100 · equity $99.4725 · realized −$0.5275 · **21** closed paper trades. All fills had `features.regime=quiet`.

### Candles

**9332** 5m bars on `AMZN ARKK BRK.B MSFT NVDA PLTR SOFI TSLA`.

**Gap:** `QQQ` is in `HIGH_BETA` (`backend/lib/config.js`) but **not** in `DEFAULT_UNIVERSE` / this candle archive. Noted; not silently added this pass (adding it would change paper scans).

### OOS (`GET /trading/setups`)

Setup metrics are **pooled across symbols**, not a setup×symbol OOS matrix. There is **no** `GET /trading/rankings` (404) — do not invent one.

Only `orb_breakout` has an OOS path: OOS **n=2**, WR 50%, gross **+$0.637** (NVDA 2026-08-25 −$0.136 + PLTR 2026-08-26 +$0.773). Need **8** OOS trades. Status is **unmeasured**, not profitable. **Do not compute SQN** (Tharp SQN needs n≥30; cap n at 100). Promotion in this repo still requires `minOosTrades` **8** (stricter than Tharp’s 30 for SQN grading) **and** not `anomaly_dependent`.

All six setups remain `paper`, `live_eligible` false.

### Crypto / futures (no OOS yet)

`crypto_gann_swing` and `nq_es_auction` have **no OOS**. Status **unmeasured**. Do not invent profitability or a ranking. Weekend/Globex books are for research while US cash is shut. Live RH crypto (`never_this_repo`) and live futures (`rithmic_stub`; later `wstrat_candlemaster`) stay off.

### Journal fills (not OOS)

These are journal fills, **not** walk-forward OOS. Label: **unmeasured**. Rows follow catalog / universe order, not P&amp;L. Do not rank setups or symbols from this.

| Setup | n | journal P&amp;L |
|---|---|---|
| `orb_breakout` | 7 | +$0.27 |
| `vwap_rsi_reversion` | 1 | −$0.25 |
| `orb_retest` | 5 | +$0.52 |
| `bar_reversal` | 8 | −$1.07 |
| `impulse_hold` | 0 | $0 |
| `roundtrip_fade` | 0 | $0 (cash cannot short) |

| Symbol | n | journal P&amp;L |
|---|---|---|
| AMZN | — | −$0.47 |
| ARKK | — | −$0.09 |
| BRK.B | — | −$0.18 |
| MSFT | — | −$0.25 |
| NVDA | — | −$0.09 |
| PLTR | 3 | +$1.16 |
| SOFI | — | −$0.30 |
| TSLA | — | −$0.31 |

`GET /research/board` returns `nextToExplore` (status queue: exploring → paper → inbox) plus this OOS-vs-journal honesty. `setupRanking` is null.

## Lab OS (links only)

Walk-forward is the lab operating system. Grade **stitched OOS**. Keep **2–5 params** with a plateau. Optional later: Bailey–López de Prado PBO/CSCV — a robustness check, **not a 6th facet**.

- Tomasini &amp; Jaekle, *Trading Systems* (Harriman): [harriman-house.com/tradingsystems](https://www.harriman-house.com/tradingsystems)
- Pardo, *The Evaluation and Optimization of Trading Strategies* (Wiley): [wiley.com](https://www.wiley.com/en-us/The+Evaluation+and+Optimization+of+Trading+Strategies%2C+2nd+Edition-p-9780470128015)
- Bailey, Borwein, López de Prado, Zhu — PBO / CSCV: [ssrn.com/abstract=2326253](https://ssrn.com/abstract=2326253)

Measurement (paper only, not live size): Van Tharp R-multiple / expectancy / SQN. Official: [vantharp.com](https://www.vantharp.com/). SQN only when n≥30 (cap n at 100).

AMT as the **5m instrument book** (IB / value / participation), not extra confirms: Dalton *Mind Over Markets* (Wiley) · Steidlmayer / CBOT Market Profile ([CME education](https://www.cmegroup.com/education/courses/market-profile.html)).

State machine (language stolen, templates not copied): **specify → code → run_is → run_wf → paper_forward → iterate | kill | promote_queue**.

- [august-andersen/trading-hypothesis-workflow](https://github.com/august-andersen/trading-hypothesis-workflow)
- [charlesbx/quant-research-lab-template](https://github.com/charlesbx/quant-research-lab-template)

Discard confluence scores (e.g. TradePad 0–14). A setup still has 2–5 named facets, not a stacked score.

## Experiment slot

**One `school_book` per slot:** `amt` | `brooks` | `tori` | `gann` | `ict_smc` | `orderflow`. Never stack.

Weekday US-cash slot: **`amt`** (`stock_auction_5m`) — **not demoted**. This weekend (US cash shut): **`gann`** on `crypto_gann_swing` (`specify`). Sunday Globex open queues `nq_es_auction` (`specify`, inbox). Brooks is a possible later 5m day-trade slot (Always-In / H2), not this week. Tag swing experiments `track=tori_trendline` (4H, do not drop below 4H) or `track=tia_gann_swing` (D/W mechanical swing-chart, **not** Square of 9). Overnight path is **one** of those tracks, not both stacked. ICT/SMC + orderflow: later ES/NQ + L2 — not the default US-cash book. A later 4H cross-method comparison is a **study**, never stacked confirms. Never stack QQQ + NQ + BTC as confirms on one stock trigger.

## Books

| Book | school_book | Kind | Family | TF | Venue | Status | News | next_action |
|---|---|---|---|---|---|---|---|---|
| `stock_auction_5m` | amt | mechanical | high_beta | 5m | alpaca_paper | paper | skip NFP/CPI/FOMC | `run_wf` |
| `crypto_gann_swing` | gann | pattern | btc_eth | D/W | ccxt_paper | exploring | may run event mornings; JH 2026-08-28 weekend overlay | `specify` |
| `gann_swing` | gann | pattern | stocks | D/W | alpaca_paper | exploring | may run event mornings | `specify` |
| `tori_trendlines` | tori | pattern | energy_metals (CL/PL/GC futures, not US cash) | 4h min | alpaca_paper | exploring | may run event mornings | `specify` |
| `nq_es_auction` | amt | mechanical | es_nq | 5m Globex (not US-cash OR) | rithmic_stub | inbox | n/a | `specify` |
| `brooks_5m` | brooks | pattern | stocks | 5m | alpaca_paper | inbox | skip NFP/CPI/FOMC | `specify` |
| `ict_smc` | ict_smc | overlay | es_nq | 5m | later | inbox | n/a | `specify` |
| `orderflow` | orderflow | parked | es_nq | tick | rithmic_stub | parked | n/a | `specify` |
| `tia_wyckoff` | — | pattern | stocks | swing | alpaca_paper | inbox | earnings skip | `specify` |
| `tia_elliott` | — | pattern | stocks | swing | alpaca_paper | inbox | earnings skip | `specify` |
| `tia_time_overlay` | — | overlay | stocks | overlay | alpaca_paper | inbox | when, not a facet | `specify` |
| `tia_process` | — | process | all | n/a | journal | inbox | n/a | `paper_forward` |

Overnight path is **`tia_gann_swing` or `tori_trendline`**, not both stacked, and never stacked on `stock_auction_5m`. Off-hours: crypto (`crypto_gann_swing`, 24/7) **or** futures (`nq_es_auction` / Tori 4H energy-metals) — each its own book. Facet budget still **2–5 per SETUP**. Live RH crypto and live futures stay off. Tori venue stays `alpaca_paper` for now; Globex CL/PL hours apply; fills are not live. `nq_es_auction` is specify only — no Globex OR detector this pass; live later is `wstrat_candlemaster`; NinjaTrader out.

## Next to explore

Rank: **exploring**, then **paper**, then **inbox**. Never promote live-eligible. One school_book in the experiment slot.

1. `crypto_gann_swing` (`specify`, exploring) — this weekend’s off-hours slot. BTC primary, ETH second. 18.6 cycle is regime. Unmeasured; no OOS.
2. `track=tia_gann_swing` stocks (`specify`, exploring) — mechanical swing-chart; not Square of 9; no detector this pass.
3. `track=tori_trendline` (`specify`, exploring) — 4H energy/metals futures; official ToriTradez/TradeZella only; never stacked on AMT or Gann.
4. AMT 5m cash auction (`run_wf`, paper) — weekday US-cash slot, **not demoted**. OOS **n=2** (unmeasured); skip NFP/CPI/FOMC already paper.
5. `nq_es_auction` (`specify`, inbox) — Sunday 4:00 PM MT Globex open queue. No Globex OR detector this pass. Unmeasured; no OOS.
6. AVGO earnings skip 2026-09-02 (`paper_forward`, inbox).
7. Brooks 5m Always-In / H2 (`specify`, inbox) — later day-trade slot.
8. TIA Wyckoff / Elliott / time overlay (`specify`, inbox) — pointers only.
9. R-multiples as journal unit (`paper_forward`, inbox) — not live size.
10. ICT/SMC + orderflow (`specify`) — later ES/NQ + L2.

## Ledger fields

Optional on `strategy_ideas`. `GET /research/ideas` and `GET /research/edge` also return `nextToExplore`.

| Field | Meaning |
|---|---|
| `school` | Experiment slot: `amt` \| `brooks` \| `tori` \| `gann` \| `ict_smc` \| `orderflow`. Other labels (wyckoff, …) are pointers, not slots. |
| `book` | id from the matrix |
| `track` | Swing experiments only: `tori_trendline` \| `tia_gann_swing`. Omit on AMT/Brooks/ICT/orderflow. |
| `timeframe` | `5m`, `4h` (Tori floor), `D/W`, `overlay`, `tick` |
| `instrumentFamily` | `high_beta`, `stocks`, `single_name`, `btc_eth`, `energy_metals`, `es_nq`, … |
| `nextAction` | enum: `specify`, `code`, `run_is`, `run_wf`, `paper_forward`, `iterate`, `kill`, `promote_queue` |
| `sourceUrl` | Drive/URL pointer only |

Statuses: `inbox` → `exploring` → `paper` → `rejected` / `parked`. Ranking ignores rejected and parked. `promote_queue` is still paper.

## Pointers (ids/links only)

### Tori Trades (Victoria Duke / ToriTradez LLC) — `track=tori_trendline`

Official: [toritradez.com](https://toritradez.com/) · TradeZella [trendline-strategy](https://www.tradezella.com/strategies/trendline-strategy).

4H workhorse — **do not drop below 4H**. Public tape: platinum and crude (also gold). Labels (not a course dump): bounce vs 2-touch break vs 3-touch (A+); action line + opposing safety line. Skip Scribd PDFs and FX Replay extra rules (not official).

### TIA Gann swing — `track=tia_gann_swing`

**Not Square of 9.** Mechanical swing-chart trend following: 1-bar / 2-bar / 3-bar; up / down / uncertain; trail under swing bottoms; 50% range midpoints; overbalancing time and price; TIME analysis masterclasses. The 18.6-year LAND cycle is a **macro regime** (whether books are even open), not a 15m trigger.

Official: [tiainvestor.com/what-is-tia](https://tiainvestor.com/what-is-tia/) · [tia-gann-swing-indicator](https://indicators.tiainvestor.com/tia-gann-swing-indicator).

Drive finding-aid (ids only; videos 02–09, **01 missing**):

| What | id |
|---|---|
| Gann folder (lessons 02–09) | [1nyq_yaY-vvcZiS5pJxHDjAlHhI7jnbf9](https://drive.google.com/drive/folders/1nyq_yaY-vvcZiS5pJxHDjAlHhI7jnbf9) |
| `The-Gann-Swing-Accelerator.pdf` | [1YFGU7ACqUb_IiR2a2rSoQe58JJu23v2T](https://drive.google.com/file/d/1YFGU7ACqUb_IiR2a2rSoQe58JJu23v2T) |
| Next watch after 02/04/07/08: Overbalancing 2025 | [1HhVMgiHWlTJaezczhZhuaEc3POdpzDWd](https://drive.google.com/file/d/1HhVMgiHWlTJaezczhZhuaEc3POdpzDWd) |
| TIME Analysis 2023 | [11HXvYMnL1FtVh1_rSysN2c69EeQO8p1D](https://drive.google.com/file/d/11HXvYMnL1FtVh1_rSysN2c69EeQO8p1D) |
| TIME 2022 | [1IxWVMr9jtN9vvRB0_8TEgW6PYKgoWqDG](https://drive.google.com/file/d/1IxWVMr9jtN9vvRB0_8TEgW6PYKgoWqDG) |

Same TIA tree also has Wyckoff Volume Accelerator and Elliott folders. TIA Premium Traders Guide *categories* to mirror (not text): mechanical vs pattern; R-multiples; advanced schools as separate courses; 7-step + trade log.

Al Brooks (later slot): [brookspriceaction.com](https://www.brookspriceaction.com/).

## Session clocks

Queryable on `GET /research/board` → `sessionClocks`. Times in **America/Denver**. Regular hours only — **do not invent holiday hours**.

| Clock | Regular hours | Notes |
|---|---|---|
| Crypto | 24/7 including Saturday | `crypto_gann_swing` / `ccxt_paper`. Live RH crypto off. |
| CME Globex | Sun 4:00 PM MT → Fri 3:00 PM MT | Daily halt Mon–Thu 3:00–4:00 PM MT. Equity-index extra halt ~2:15–2:30 PM MT (ES/NQ). |
| US cash RTH | Weekday 7:30 AM–2:00 PM MT (9:30–4:00 ET) | Closed weekends and US cash holidays. |

Holiday hours: [cmegroup.com/trading-hours.html](https://www.cmegroup.com/trading-hours.html). Labor Day 2026 is **Monday 2026-09-07** (first Monday of September; not 2026-09-01). US cash closed. Globex typically early halt — verify the exact halt on that page; do not invent it.

## News overlay

Events already filed (optional skip / 5m auction skip; Gann/Tori higher-TF may still run the macro mornings):

- **Jackson Hole** 2026-08-28 — Fed Chair Kevin Warsh hawkish keynote. Weekend overlay for `crypto_gann_swing`, **not** a 6th facet. BTC off Thursday high ~$81,455; news support ~$76,800–$77,000; resistance ~$79,500–$80,300. Spot BTC ETFs ~$202M Friday outflow. Do not live-trade RH crypto.
- **AVGO** 2026-09-02 after close — optional skip
- **NFP** 2026-09-04 — 5m auction skip
- **Labor Day** 2026-09-07 — US cash closed; Globex typically early halt (verify at CME; do not invent the time)
- **CPI** 2026-09-11 — 5m auction skip
- **FOMC** 2026-09-16 — 5m auction skip

- **5m auction / Brooks later:** skip NFP/CPI/FOMC mornings (auction skip already paper).
- **Gann D/W (`tia_gann_swing`) and Tori 4H (`tori_trendline`):** may still run those days; crypto Gann may run event mornings.
- **All US-cash names:** single-name earnings skip (AVGO 2026-09-02 AC).

Query: `GET /research/board`. Named 5m edge: [STRATEGY.md](STRATEGY.md).
