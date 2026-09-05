# Idea 8 — 30m-OR / 5m book (paper)

Book `stock_orb30_5m`. Not a facet on `stock_auction_5m` (15m OR + VWAP + rvol).
`liveEligible=false`. Do not invent eligibility. Paper only.

## How to run

```bash
cd backend
npm run paper:orb30
npm run paper:orb30 -- --days 90
```

Uses the existing paper replay bars client: Alpaca IEX 5m when paper keys are real; otherwise the repo’s deterministic synthetic RTH tape (same path as `paper:replay` without keys). Isolated journal — does not wipe `trade_journal`.

## This environment’s walk-forward (2026-09-05)

Command: `npm run paper:orb30 -- --days 90`

| Field | Value |
|---|---|
| Source | **synthetic** (placeholder Alpaca keys — not IEX, not the leif Aug 2026 sample) |
| Sessions | 90 |
| Universe | SOFI, BRK.B, TSLA, AMZN, ARKK, MSFT, NVDA, PLTR |
| News skip | NFP/CPI/FOMC (`skip_5m_auction` dates plus the same event types on the lookback calendar) |
| Lunch | no new entries 11:30–13:30 ET |
| Flatten | cash close |
| Max entries/day | 1 |
| liveEligible | **false** |

Market OOS is **unmeasured**. The synthetic generator is biased toward opening-range breakouts, so n and win rate here are a mechanics check, not a promote-able edge. The verified leif API sample for the *named* 15m book remains OOS **n=2**.

### Variant grid (synthetic tape)

| Setup | SL | R | journal n | journal WR | journal E[R] | OOS n | OOS WR | OOS E[R] | OOS $ | label |
|---|---|---|---|---|---|---|---|---|---|---|
| `orb30_sr_1r` | sr | 1R | 83 | 78% | +0.57R | 78 | 77% | +0.54R | $19.90 | measured-on-synthetic |
| `orb30_sr_2r` | sr | 2R | 83 | 76% | +0.78R | 78 | 74% | +0.73R | $24.65 | measured-on-synthetic |
| `orb30_sr_3r` | sr | 3R | 83 | 76% | +0.88R | 78 | 74% | +0.82R | $25.24 | measured-on-synthetic |
| `orb30_fib_1r` | fib | 1R | 83 | 67% | +0.35R | 78 | 65% | +0.31R | $8.38 | measured-on-synthetic |
| `orb30_fib_2r` | fib | 2R | 83 | 61% | +0.77R | 78 | 60% | +0.75R | $17.92 | measured-on-synthetic |
| `orb30_fib_3r` | fib | 3R | 83 | 60% | +0.79R | 78 | 59% | +0.77R | $18.25 | measured-on-synthetic |

### Nearby null (same tape)

`orb_breakout` — 15m OR + VWAP + rvol, stop at OR low, 1.5R.

Journal n=84 WR 92% E[R]=+1.27R. OOS n=79 WR 91% E[R]=+1.26R pnl=+$12.21. **liveEligible=false**.

### What worked / failed vs the null

- **Mechanics worked:** 30m OR lock at 10:00 ET, lunch blackout, NFP/CPI/FOMC skip, flatten-by-close, one entry/day, SR vs Fib stops, 1R–3R targets. Unit tests cover those gates.
- **On this synthetic tape, orb30 did not beat the named 15m null on OOS E[R].** Best orb30 variant was `orb30_sr_3r` at +0.82R vs null +1.26R.
- **SR vs Fib:** mean OOS E[R] SR +0.69R vs Fib +0.61R. Fib stops sit inside the OR (0.618 retrace), so they get tagged more often (WR 59–65% vs SR 74–77%). Not a market conclusion.
- **Hypothesis not confirmed.** “Fewer, cleaner ORB trades with structure-aware stops beat the thin named-edge OOS” is **unmeasured** on Alpaca and **failed vs the nearby null** on the repo synthetic tape.
- Do not compute SQN (synthetic; also do not size live from SQN). Do not promote.

Re-run with real Alpaca paper keys to grow a *market* OOS. Promotion still needs OOS n≥8 on real tape **and** not `anomaly_dependent`. Until then idea 8 stays paper.
