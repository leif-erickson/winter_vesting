'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parsePaperArgs } = require('../cli');
const { DEFAULT_REPLAY_DAYS } = require('../lib/config');
const { LIVE_SWITCH } = require('../lib/robinhood');

describe('paper CLI args', () => {
  it('defaults replay to append with the long Alpaca lookback', () => {
    assert.deepEqual(parsePaperArgs(['node', 'cli.js', 'replay']), {
      reset: false,
      days: DEFAULT_REPLAY_DAYS,
    });
  });

  it('treats --reset as an explicit rebuild flag, not a days value', () => {
    assert.deepEqual(parsePaperArgs(['node', 'cli.js', 'replay', '--reset']), {
      reset: true,
      days: DEFAULT_REPLAY_DAYS,
    });
    assert.deepEqual(parsePaperArgs(['node', 'cli.js', 'replay', '40', '--reset']), {
      reset: true,
      days: 40,
    });
    assert.deepEqual(parsePaperArgs(['node', 'cli.js', 'replay', '--days', '60']), {
      reset: false,
      days: 60,
    });
    assert.deepEqual(parsePaperArgs(['node', 'cli.js', 'replay', '--days=75', '--reset']), {
      reset: true,
      days: 75,
    });
  });

  it('does not enable live from CLI parsing', () => {
    assert.equal(LIVE_SWITCH, false);
  });
});
