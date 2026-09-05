'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isAuctionSkipDay,
  skipReason,
  filedAuctionSkipDates,
  FILED_AUCTION_SKIP,
} = require('../lib/newsSkip');
const { FILED_EVENTS } = require('../lib/researchBoard');

describe('NFP/CPI/FOMC auction skip', () => {
  it('matches the research-board skip_5m_auction overlays', () => {
    const filed = FILED_EVENTS.filter((e) => e.overlay === 'skip_5m_auction').map((e) => e.date);
    assert.deepEqual(filedAuctionSkipDates(), ['2026-09-04', '2026-09-11', '2026-09-16']);
    assert.deepEqual(filed, filedAuctionSkipDates());
    assert.equal(FILED_AUCTION_SKIP[0].title, 'NFP');
    assert.equal(isAuctionSkipDay('2026-09-04'), true);
    assert.equal(skipReason('2026-09-04'), 'nfp');
    assert.equal(isAuctionSkipDay('2026-09-11'), true);
    assert.equal(skipReason('2026-09-11'), 'cpi');
    assert.equal(isAuctionSkipDay('2026-09-16'), true);
    assert.equal(skipReason('2026-09-16'), 'fomc');
  });

  it('does not skip an ordinary cash session', () => {
    assert.equal(isAuctionSkipDay('2026-09-03'), false);
    assert.equal(skipReason('2026-09-03'), null);
    assert.equal(isAuctionSkipDay('2026-08-26'), false);
  });
});
