'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadConfig,
  SETUPS,
  MAX_FACETS,
  setupIdsForSymbol,
  assertFacetBudget,
  ASSET_BOOKS,
  DEFAULT_REPLAY_DAYS,
} = require('../lib/config');
const { FACET_FIELDS, MAX_DETECTOR_FACETS } = require('../lib/signals');
const { NON_ENTRY_NAMES } = require('../lib/schools');

describe('facet budget / instrument families / books', () => {
  it('declares 2–5 named facets on every setup', () => {
    assert.equal(MAX_FACETS, 5);
    assert.equal(MAX_DETECTOR_FACETS, 5);
    assertFacetBudget(SETUPS, MAX_FACETS);
    for (const setup of SETUPS) {
      assert.ok(setup.facets.length >= 2);
      assert.ok(setup.facets.length <= MAX_FACETS);
    }
    for (const [id, fields] of Object.entries(FACET_FIELDS)) {
      assert.ok(fields.length <= MAX_FACETS, `${id} reads ${fields.length} fields`);
    }
    const config = loadConfig();
    const orb = config.setups.find((s) => s.id === 'orb_breakout');
    assert.deepEqual(orb.facets, ['or_break', 'above_vwap', 'rvol']);
    assert.equal(orb.facets.length, 3);
    assert.equal(config.schools.amt.bySetup.orb_breakout.or_break, 'initial_balance');
    for (const setup of config.setups) {
      for (const name of NON_ENTRY_NAMES) {
        assert.equal(setup.facets.includes(name), false, `${setup.id} must not facet ${name}`);
      }
    }
  });

  it('rejects a detector that exceeds maxFacets', () => {
    assert.throws(
      () => assertFacetBudget([{ id: 'too_many', facets: ['a', 'b', 'c', 'd', 'e', 'f'] }]),
      /2–5 facets/
    );
    assert.throws(
      () => assertFacetBudget([{ id: 'too_few', facets: ['a'] }]),
      /2–5 facets/
    );
  });

  it('routes slow large-cap away from ORB and high-beta away from VWAP reclaim', () => {
    const slow = setupIdsForSymbol('BRK.B');
    assert.ok(slow.includes('vwap_rsi_reversion'));
    assert.ok(!slow.includes('orb_breakout'));
    const fast = setupIdsForSymbol('SOFI');
    assert.ok(fast.includes('orb_breakout'));
    assert.ok(fast.includes('orb_retest'));
    assert.ok(!fast.includes('vwap_rsi_reversion'));
  });

  it('names four asset books with live still out of band here', () => {
    const config = loadConfig();
    assert.equal(config.assetBooks.stocks.venue, 'alpaca_paper');
    assert.equal(ASSET_BOOKS.futures.live, 'wstrat_candlemaster');
    assert.equal(ASSET_BOOKS.futures.venue, 'rithmic_stub');
    assert.match(ASSET_BOOKS.futures.notes, /Globex Sunday 4:00 PM MT/);
    assert.match(ASSET_BOOKS.futures.notes, /nq_es_auction/);
    assert.equal(ASSET_BOOKS.options.live, 'not_on_100_cash_rh');
    assert.equal(ASSET_BOOKS.crypto.live, 'never_this_repo');
    assert.equal(ASSET_BOOKS.crypto.venue, 'ccxt_paper');
    assert.match(ASSET_BOOKS.crypto.notes, /Weekend\/24h/);
    assert.match(ASSET_BOOKS.crypto.notes, /BTC\/ETH/);
  });

  it('uses a longer Alpaca historical lookback than a two-week window', () => {
    const config = loadConfig();
    assert.equal(DEFAULT_REPLAY_DAYS, 90);
    assert.equal(config.replayDays, 90);
    assert.ok(DEFAULT_REPLAY_DAYS > 20);
  });
});
