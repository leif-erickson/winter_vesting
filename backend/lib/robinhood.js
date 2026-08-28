'use strict';

/**
 * Robinhood execution adapter.
 *
 * HARD DEFAULT OFF.
 * Grok Bot will call Robinhood MCP (review then place) only after the user
 * confirms a specific order. Never place real orders from this repo.
 *
 * No Robinhood API keys belong in this repository. Live routing is out of
 * band: this stub refuses to submit, even if ROBINHOOD_LIVE is set.
 */
const LIVE_SWITCH = false;

function isLiveEnabled(env = process.env) {
  return LIVE_SWITCH === true && env.ROBINHOOD_LIVE === '1';
}

/**
 * @param {object} order
 * @param {object} [options]
 * @returns {Promise<{ok: boolean, reason: string, message: string, order?: object}>}
 */
async function placeOrder(order, options = {}) {
  const env = options.env || process.env;
  if (!isLiveEnabled(env)) {
    return {
      ok: false,
      reason: 'live_disabled',
      message:
        'Live Robinhood execution is hard-off. Paper only. After a setup is live-eligible, Grok Bot may call Robinhood MCP (review then place) only once the user confirms that specific order.',
      order: { ...order, mode: 'paper' },
    };
  }
  return {
    ok: false,
    reason: 'out_of_band',
    message: 'This repo never places real orders. Use Robinhood Agentic Trading MCP out of band after explicit user confirmation.',
  };
}

module.exports = {
  LIVE_SWITCH,
  isLiveEnabled,
  placeOrder,
};
