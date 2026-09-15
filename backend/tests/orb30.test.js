'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, SETUPS, setupIdsForSymbol, assertFacetBudget } = require('../lib/config');
const { DETECTORS } = require('../lib/signals');
const { LIVE_SWITCH } = require('../lib/robinhood');
const {
  ORB30_BOOK_ID,
  ORB30_IDEA_ID,
  ORB30_OR_BARS,
  ORB30_SETUPS,
  ORB30_FACETS,
  LUNCH_START_MINUTE,
  LUNCH_END_MINUTE,
  inLunchBlackout,
  canOpenOrb30,
  annotateOrb30Session,
  srStop,
  fibStop,
  signalsForOrb30,
  generateOrb30SessionBars,
  generateOrb30Universe,
} = require('../lib/orb30');
const { runOrb30Replay, gradeVariant } = require('../lib/orb30Replay');
const { RESEARCH_BOOKS, CATALOG_IDEAS, boardSnapshot } = require('../lib/researchBoard');
const { tradeRMultiple } = require('../lib/rank');

function variant(slMode, rMultiple) {
  return ORB30_SETUPS.find((s) => s.slMode === slMode && s.rMultiple === rMultiple);
}

describe('stock_orb30_5m book (idea 8)', () => {
  it('is a separate book and is not wired into the named 15m edge', () => {
    assert.equal(ORB30_IDEA_ID, 8);
    assert.equal(ORB30_OR_BARS, 6);
    assert.equal(SETUPS.some((s) => String(s.id).startsWith('orb30_')), false);
    assert.equal(Object.keys(DETECTORS).some((id) => id.startsWith('orb30_')), false);
    assert.equal(setupIdsForSymbol('SOFI').includes('orb30_sr_1r'), false);
    assert.equal(setupIdsForSymbol('BRK.B').includes('orb_breakout'), false);
    const named = SETUPS.find((s) => s.id === 'orb_breakout');
    assert.deepEqual(named.facets, ['or_break', 'above_vwap', 'rvol']);
    assert.equal(named.facets.includes('or30_break'), false);
    assertFacetBudget(ORB30_SETUPS);
    for (const setup of ORB30_SETUPS) {
      assert.deepEqual(setup.facets, ORB30_FACETS);
      assert.equal(setup.facets.includes('above_vwap'), false);
      assert.equal(setup.facets.includes('rvol'), false);
      assert.equal(setup.liveEligible, false);
      assert.equal(setup.book, ORB30_BOOK_ID);
    }
    assert.equal(LIVE_SWITCH, false);
    const board = boardSnapshot({ setups: SETUPS });
    assert.ok(board.books.some((b) => b.id === ORB30_BOOK_ID));
    assert.equal(board.experimentSlot.book, 'stock_auction_5m');
    assert.equal(board.liveEligibleFromBoard, false);
    const idea = CATALOG_IDEAS.find((i) => i.id === 8);
    assert.ok(idea);
    assert.equal(idea.book, ORB30_BOOK_ID);
    assert.equal(idea.liveEligible, false);
    assert.equal(RESEARCH_BOOKS.find((b) => b.id === ORB30_BOOK_ID).liveEligible, false);
    const config = loadConfig();
    assert.equal(config.skipMacroDays, false);
    assert.equal(config.orb30.liveEligible, false);
  });

  it('uses a 30-minute OR, skips lunch and NFP, and sizes 1R–3R vs SR/Fib', () => {
    const date = '2026-06-03';
    const bars = generateOrb30SessionBars('SOFI', date, { start: 20, scenario: 'breakout' });
    const config = loadConfig();
    const annotated = annotateOrb30Session(bars, { config });
    assert.equal(annotated[5].orLocked, false);
    assert.equal(annotated[6].orLocked, true);
    assert.ok(annotated[6].orHigh > annotated[6].orLow);
    const lunchBar = annotated.find((b) => b.minuteOfDay === LUNCH_START_MINUTE);
    assert.ok(lunchBar);
    assert.equal(inLunchBlackout(lunchBar.minuteOfDay), true);
    assert.equal(inLunchBlackout(LUNCH_END_MINUTE), false);
    assert.equal(canOpenOrb30({ ...lunchBar, orLocked: true, orBars: 6, sessionDate: date }), false);

    const sr = variant('sr', 2);
    const { signals } = signalsForOrb30(bars, { config, variant: sr });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].setupId, 'orb30_sr_2r');
    assert.ok(signals[0].minuteOfDay >= 10 * 60);
    assert.ok(signals[0].minuteOfDay < LUNCH_START_MINUTE);
    assert.equal(signals[0].features.facets.includes('rvol'), false);
    assert.equal(signals[0].features.book, ORB30_BOOK_ID);
    const risk = signals[0].paperPrice - signals[0].stop;
    assert.ok(risk > 0);
    assert.ok(Math.abs(signals[0].target - (signals[0].paperPrice + 2 * risk)) < 1e-9);

    const i = annotated.findIndex((b) => b.ts === signals[0].ts);
    const srPx = srStop(annotated[i], annotated, i);
    const fibPx = fibStop(annotated[i], annotated, i);
    assert.ok(srPx < signals[0].paperPrice);
    assert.ok(fibPx < signals[0].paperPrice);
    assert.ok(fibPx > srPx, 'Fib 0.618 of OR/impulse should sit above the OR-low SR stop');

    const fibSignals = signalsForOrb30(bars, { config, variant: variant('fib', 1) }).signals;
    assert.equal(fibSignals.length, 1);
    const fibRisk = fibSignals[0].paperPrice - fibSignals[0].stop;
    assert.ok(Math.abs(fibSignals[0].target - (fibSignals[0].paperPrice + 1 * fibRisk)) < 1e-9);
    assert.ok(fibSignals[0].stop > signals[0].stop);

    const nfp = generateOrb30SessionBars('SOFI', '2026-09-04', { start: 20, scenario: 'breakout' });
    const skipped = signalsForOrb30(nfp, { config, variant: sr });
    assert.equal(skipped.signals.length, 0);
    assert.equal(skipped.skipped, 'nfp');
  });

  it('walk-forwards the grid without enabling live and compares a nearby null', async () => {
    const config = loadConfig({ DAYTRADE_UNIVERSE: 'SOFI,PLTR,NVDA' });
    const barsClient = {
      async loadBars() {
        return generateOrb30Universe(config.universe, { sessions: 28, startDate: '2026-06-01' });
      },
    };
    const result = await runOrb30Replay({
      barsClient,
      config,
      days: 40,
      env: {},
      writeReport: false,
    });
    assert.equal(result.ideaId, 8);
    assert.equal(result.book, ORB30_BOOK_ID);
    assert.equal(result.live, false);
    assert.equal(result.liveEligible, false);
    assert.equal(result.variants.length, 6);
    for (const row of result.variants) {
      assert.equal(row.liveEligible, false);
      assert.ok(row.journal.n >= 1, `${row.setupId} should fill on the orb30 tape`);
      assert.ok(row.journal.expectancyR != null);
    }
    assert.equal(result.nullBook.setupId, 'orb_breakout');
    assert.match(result.markdown, /unmeasured|measured/);
    assert.match(result.markdown, /liveEligible=false/);
    assert.doesNotMatch(result.markdown, /most-profitable/);
    const r = tradeRMultiple({
      paper_price: 10,
      stop_price: 9,
      exit_price: 12,
      status: 'closed',
    });
    assert.equal(r, 2);
    const thin = gradeVariant([]);
    assert.equal(thin.liveEligible, false);
    assert.equal(thin.oos.label, 'unmeasured');
    const md = fs.readFileSync(path.join(__dirname, '../../docs/ORB30.md'), 'utf8');
    assert.match(md, /liveEligible=false/);
    assert.match(md, /unmeasured/);
    assert.match(md, /Did not beat the named 15m null|did not beat the named 15m null/i);
    assert.doesNotMatch(md, /most-profitable/);
  });
});
