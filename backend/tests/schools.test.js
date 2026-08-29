'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  AMT_ROLES,
  FACET_TO_AMT,
  SMC_TAGS,
  VSA_TAGS,
  NON_ENTRY_NAMES,
  PARKED,
  SWING_BOOKS,
  amtMapForFacets,
  assertAmtIsNotAFacet,
  researchTagsFrom,
  schoolSnapshot,
  isLiquiditySweep,
  isFvg,
  isOrderBlock,
  isBos,
  isEffortVsResult,
  isNoDemand,
} = require('../lib/schools');
const { SETUPS, MAX_FACETS, loadConfig, edgeSnapshot, assertFacetBudget } = require('../lib/config');
const { OrderflowSession } = require('../lib/candle');

describe('AMT / SMC / VSA school mapping', () => {
  it('maps the three named-edge facets onto AMT roles', () => {
    assert.equal(AMT_ROLES.initial_balance.includes('opening range'), true);
    assert.equal(FACET_TO_AMT.or_break, 'initial_balance');
    assert.equal(FACET_TO_AMT.above_vwap, 'value');
    assert.equal(FACET_TO_AMT.rvol, 'participation');
    const amt = amtMapForFacets(['or_break', 'above_vwap', 'rvol']);
    assert.deepEqual(amt, {
      or_break: 'initial_balance',
      above_vwap: 'value',
      rvol: 'participation',
    });
    assert.equal(Object.keys(amt).length, 3);
  });

  it('does not treat AMT roles or SMC/VSA tags as entry facets', () => {
    assertFacetBudget(SETUPS, MAX_FACETS);
    assertAmtIsNotAFacet(SETUPS);
    for (const setup of SETUPS) {
      assert.ok(setup.facets.length >= 2);
      assert.ok(setup.facets.length <= MAX_FACETS);
      for (const facet of setup.facets) {
        assert.equal(NON_ENTRY_NAMES.includes(facet), false, `${setup.id} facet ${facet}`);
      }
    }
    assert.throws(
      () => assertAmtIsNotAFacet([{ id: 'stacked', facets: ['or_break', 'above_vwap', 'rvol', 'fvg'] }]),
      /must not declare school label/
    );
    assert.throws(
      () => assertFacetBudget([{
        id: 'too_many',
        facets: ['or_break', 'above_vwap', 'rvol', 'fvg', 'bos', 'no_demand'],
      }]),
      /2–5 facets/
    );
  });

  it('exposes the mapping on GET /research/edge snapshot without growing the facet budget', () => {
    const edge = edgeSnapshot(loadConfig());
    assert.equal(edge.maxFacets, 5);
    assert.equal(edge.schools.amt.gateEntries, false);
    assert.equal(edge.schools.smc.gateEntries, false);
    assert.equal(edge.schools.vsa.gateEntries, false);
    assert.equal(edge.schools.orderflow.status, 'parked');
    assert.equal(edge.schools.gann.status, 'swing_book');
    assert.equal(edge.schools.tori.status, 'swing_book');
    assert.equal(edge.liveEligibleFromBoard, false);
    assert.ok(Array.isArray(edge.nextToExplore));
    assert.ok(edge.nextToExplore.length >= 1);
    assert.equal(edge.nextToExplore.every((i) => i.liveEligible === false), true);
    const orb = edge.setups.find((s) => s.id === 'orb_breakout');
    assert.deepEqual(orb.facets, ['or_break', 'above_vwap', 'rvol']);
    assert.equal(orb.amt.or_break, 'initial_balance');
    assert.equal(orb.amt.above_vwap, 'value');
    assert.equal(orb.amt.rvol, 'participation');
    assert.equal(orb.facets.length, 3);
  });

  it('returns an empty researchTags list when geometry does not match', () => {
    const bars = [
      { open: 10, high: 10.02, low: 9.98, close: 10.01, volume: 1000, rvol: 1.0, orHigh: 10.1, orLow: 9.9 },
      { open: 10.01, high: 10.03, low: 9.99, close: 10.02, volume: 1000, rvol: 1.0, orHigh: 10.1, orLow: 9.9 },
      { open: 10.02, high: 10.04, low: 10.0, close: 10.03, volume: 1100, rvol: 1.05, orHigh: 10.1, orLow: 9.9 },
    ];
    assert.deepEqual(researchTagsFrom(bars, 2), []);
    assert.deepEqual(researchTagsFrom(null, 0), []);
    assert.deepEqual(researchTagsFrom(bars, -1), []);
  });

  it('may tag SMC/VSA from 5m geometry without calling that a confirm', () => {
    const sweep = { high: 10.4, low: 10.0, close: 10.1, open: 10.2, orHigh: 10.2, orLow: 9.8, rvol: 1.1, volume: 1000 };
    assert.equal(isLiquiditySweep(sweep), true);

    const fvgBars = [
      { high: 10.0, low: 9.9, open: 9.95, close: 10.0 },
      { high: 10.05, low: 10.0, open: 10.0, close: 10.04 },
      { high: 10.3, low: 10.2, open: 10.2, close: 10.28 },
    ];
    assert.equal(isFvg(fvgBars, 2), true);

    const obBars = [
      { open: 10.2, close: 10.0, high: 10.22, low: 9.98 },
      { open: 10.05, close: 10.3, high: 10.32, low: 10.04 },
    ];
    assert.equal(isOrderBlock(obBars, 1), true);

    assert.equal(isBos({ close: 10.5, swingHigh: 10.4 }, { close: 10.3 }), true);
    assert.equal(isEffortVsResult({
      open: 10.0, close: 10.02, high: 10.2, low: 9.8, rvol: 2.0,
    }), true);
    assert.equal(isNoDemand({
      open: 10.0, close: 10.1, high: 10.12, low: 10.0, rvol: 0.7, volume: 400,
    }, { volume: 1200 }), true);

    const tagged = researchTagsFrom([
      { open: 10.2, close: 10.0, high: 10.22, low: 9.98, volume: 800, rvol: 0.9, orHigh: 10.5, orLow: 9.7 },
      { open: 10.0, close: 10.0, high: 10.05, low: 9.99, volume: 700, rvol: 0.8, orHigh: 10.5, orLow: 9.7 },
      {
        open: 10.05, close: 10.4, high: 10.55, low: 10.04, volume: 3000, rvol: 2.0,
        orHigh: 10.5, orLow: 9.7, swingHigh: 10.3,
      },
    ], 2);
    assert.ok(tagged.length >= 1);
    for (const tag of tagged) {
      assert.ok(SMC_TAGS.includes(tag) || VSA_TAGS.includes(tag));
    }
  });

  it('parks orderflow and treats Gann/Tori as swing books, not facets', () => {
    assert.equal(PARKED.orderflow.status, 'parked');
    assert.equal(PARKED.gann, undefined);
    assert.equal(SWING_BOOKS.gann.status, 'swing_book');
    assert.equal(SWING_BOOKS.tori.status, 'swing_book');
    assert.equal(SWING_BOOKS.gann.gateEntries, false);
    assert.equal(SWING_BOOKS.tori.gateEntries, false);
    assert.throws(() => new OrderflowSession(), (err) => err.code === 'NOT_IMPLEMENTED');
    assert.throws(() => OrderflowSession.fromCandles(), (err) => err.code === 'NOT_IMPLEMENTED');
    const snap = schoolSnapshot(SETUPS);
    assert.match(snap.orderflow.note, /NOT_IMPLEMENTED/);
    assert.match(snap.gann.note, /not Square of 9/);
    assert.match(snap.tori.note, /4H workhorse/);
    for (const setup of SETUPS) {
      assert.equal(setup.facets.includes('gann'), false, `${setup.id} must not facet gann`);
      assert.equal(setup.facets.includes('tori'), false, `${setup.id} must not facet tori`);
    }
    assert.equal(NON_ENTRY_NAMES.includes('gann'), true);
    assert.equal(NON_ENTRY_NAMES.includes('tori'), true);
    assert.equal(NON_ENTRY_NAMES.includes('brooks'), true);
    assert.equal(snap.brooks.status, 'later_slot');
    assert.equal(snap.ict_smc.status, 'later_es_nq');
  });

  it('detectors never mention SMC/VSA tags as conditions', () => {
    const src = fs.readFileSync(path.join(__dirname, '../lib/signals.js'), 'utf8');
    const start = src.indexOf('function orbBreakout');
    const end = src.indexOf('const DETECTORS');
    const detectors = src.slice(start, end);
    assert.doesNotMatch(detectors, /researchTags/);
    assert.doesNotMatch(detectors, /liquidity_sweep/);
    assert.doesNotMatch(detectors, /order_block/);
    assert.doesNotMatch(detectors, /effort_vs_result/);
    assert.doesNotMatch(detectors, /no_demand/);
    assert.doesNotMatch(detectors, /\bfvg\b/);
    assert.doesNotMatch(detectors, /initial_balance/);
    assert.doesNotMatch(src, /\bgann\b/i);
    assert.doesNotMatch(src, /\btori\b/i);
  });
});
