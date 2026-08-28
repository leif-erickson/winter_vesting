'use strict';

/**
 * Rithmic Protocol API adapter STUB.
 *
 * This repo does not speak Rithmic plants and does not place futures orders.
 * Live ES/NQ (MES/MNQ) belongs in the wstrat_candlemaster Python runtime after
 * R|Protocol broker conformance. NinjaTrader is not a routing path.
 *
 * Grok Bot must emit a signed intent the candlemaster runtime executes.
 * Do not copy wstrat_candlemaster into this tree.
 */

const DEFAULTS = {
  RITHMIC_SYSTEM_NAME: 'Rithmic Test',
  RITHMIC_APP_NAME: 'stock_market',
  RITHMIC_URL: 'rituz00100.rithmic.com:443',
};

const SUBMIT_ERROR =
  'Rithmic live is not enabled in stock_market; use wstrat_candlemaster runtime after conformance. NinjaTrader is not a routing path.';

function createRithmicAdapter({ env = process.env } = {}) {
  const user = env.RITHMIC_USER || '';
  const password = env.RITHMIC_PASSWORD || '';
  const systemName = env.RITHMIC_SYSTEM_NAME || DEFAULTS.RITHMIC_SYSTEM_NAME;
  const appName = env.RITHMIC_APP_NAME || DEFAULTS.RITHMIC_APP_NAME;
  const appVersion = env.RITHMIC_APP_VERSION || '';
  const url = env.RITHMIC_URL || DEFAULTS.RITHMIC_URL;
  const configured = Boolean(user && password);

  return {
    venue: 'rithmic',
    status() {
      return {
        configured,
        live: false,
        dryRun: true,
        venue: 'rithmic',
        systemName,
        appName,
        appVersion: appVersion || null,
        url,
        note:
          'Rithmic adapter is a stub. Live futures (ES/NQ, MES/MNQ) belong in the wstrat_candlemaster Python runtime after R|Protocol conformance. This repo does not speak Rithmic plants. NinjaTrader is not a routing path. Grok Bot must emit a signed intent the candlemaster runtime executes.',
      };
    },
    async submitOrder() {
      throw new Error(SUBMIT_ERROR);
    },
  };
}

module.exports = {
  createRithmicAdapter,
  DEFAULTS,
  SUBMIT_ERROR,
};
