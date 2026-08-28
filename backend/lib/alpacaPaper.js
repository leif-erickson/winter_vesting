'use strict';

/**
 * Alpaca PAPER adapter for the daily live-data PoC.
 *
 * Hard rules:
 * - Client is always constructed with paper: true.
 * - Trading host is https://paper-api.alpaca.markets.
 * - https://api.alpaca.markets (live) is refused.
 * - ALPACA_LIVE=1 is refused.
 * - Order submit is off unless ALPACA_SUBMIT_PAPER=1. Default: local journal
 *   is the fill source of truth. Do not enable submit in CI.
 */

const PAPER_BASE_URL = 'https://paper-api.alpaca.markets';
const LIVE_BASE_URL = 'https://api.alpaca.markets';
const LIVE_HOST = 'api.alpaca.markets';
const PAPER_HOST = 'paper-api.alpaca.markets';

function AlpacaLiveRefusedError(message) {
  const err = new Error(message);
  err.code = 'ALPACA_LIVE_REFUSED';
  err.name = 'AlpacaLiveRefusedError';
  return err;
}

function hostnameOf(url) {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw) return '';
  try {
    const withScheme = raw.includes('://') ? raw : `https://${raw}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  }
}

function isLiveBaseUrl(url) {
  const host = hostnameOf(url);
  return host === LIVE_HOST;
}

function isPaperBaseUrl(url) {
  const host = hostnameOf(url);
  return host === PAPER_HOST;
}

function isLiveFlag(value) {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function requestedBaseUrl(env = process.env, baseUrl) {
  if (baseUrl) return baseUrl;
  return env.ALPACA_BASE_URL || env.APCA_API_BASE_URL || null;
}

/**
 * Refuse any configuration that would hit the live Alpaca trading API.
 * @throws {Error} code ALPACA_LIVE_REFUSED
 */
function assertPaperOnly(env = process.env, { baseUrl } = {}) {
  if (isLiveFlag(env.ALPACA_LIVE)) {
    throw AlpacaLiveRefusedError(
      'Alpaca live trading is refused (ALPACA_LIVE is set). This PoC is paper-only at https://paper-api.alpaca.markets. Live money trading is not enabled in stock_market.'
    );
  }
  const url = requestedBaseUrl(env, baseUrl);
  if (url && isLiveBaseUrl(url)) {
    throw AlpacaLiveRefusedError(
      `Alpaca live trading is refused. Base URL ${url} hits ${LIVE_BASE_URL}. Use ${PAPER_BASE_URL} (paper: true). Live money trading is not enabled in stock_market.`
    );
  }
  return true;
}

function isPaperSubmitEnabled(env = process.env) {
  return env.ALPACA_SUBMIT_PAPER === '1';
}

/**
 * Construct an Alpaca client that can only talk to the paper trading host.
 * `paper: true` is hardcoded. Live base URLs and ALPACA_LIVE are refused
 * rather than silently rewritten.
 */
function createAlpacaPaperClient({ env = process.env, Alpaca, baseUrl } = {}) {
  assertPaperOnly(env, { baseUrl });
  const Ctor = Alpaca || require('alpaca-trade-api');
  return new Ctor({
    keyId: env.ALPACA_API_KEY,
    secretKey: env.ALPACA_SECRET_KEY,
    paper: true,
    // Force the paper host so APCA_API_BASE_URL cannot sneak in live after the check.
    baseUrl: PAPER_BASE_URL,
  });
}

/**
 * Submit an order to Alpaca paper only when ALPACA_SUBMIT_PAPER=1.
 * Default off: local journal remains the fill source of truth.
 */
async function submitPaperOrder(client, order, { env = process.env } = {}) {
  assertPaperOnly(env);
  if (!isPaperSubmitEnabled(env)) {
    return {
      submitted: false,
      reason: 'submit_disabled',
      message:
        'ALPACA_SUBMIT_PAPER is off (default). Local journal is the fill source of truth. Set ALPACA_SUBMIT_PAPER=1 to mirror fills to the Alpaca paper API only — never in CI.',
    };
  }
  if (!client || typeof client.createOrder !== 'function') {
    throw new Error('Alpaca paper client with createOrder is required when ALPACA_SUBMIT_PAPER=1');
  }
  const side = String(order.side || 'buy').toLowerCase();
  const type = String(order.type || 'market').toLowerCase();
  const body = {
    symbol: order.symbol,
    qty: String(order.qty ?? order.size ?? order.quantity),
    side,
    type,
    time_in_force: order.timeInForce || order.time_in_force || 'day',
  };
  if (type === 'limit') {
    const limit = order.limitPrice ?? order.limit_price ?? order.paperPrice;
    if (limit != null) body.limit_price = String(limit);
  }
  const created = await client.createOrder(body);
  return {
    submitted: true,
    brokerOrderId: created.id || created.client_order_id || null,
    order: created,
    venue: 'alpaca-paper',
    paper: true,
  };
}

/**
 * Read-only Alpaca PAPER account snapshot. Never places orders.
 */
async function fetchPaperAccountSnapshot(client) {
  if (!client) {
    return { ok: false, paper: true, label: 'PAPER', reason: 'no_client' };
  }
  try {
    const account = await client.getAccount();
    let positions = [];
    if (typeof client.getPositions === 'function') {
      positions = await client.getPositions();
    }
    return {
      ok: true,
      paper: true,
      label: 'PAPER',
      equity: Number(account.equity),
      cash: Number(account.cash),
      buyingPower: Number(account.buying_power ?? account.buyingPower),
      positionsCount: Array.isArray(positions) ? positions.length : 0,
    };
  } catch (err) {
    return {
      ok: false,
      paper: true,
      label: 'PAPER',
      reason: 'unreachable',
      message: err.message,
    };
  }
}

module.exports = {
  PAPER_BASE_URL,
  LIVE_BASE_URL,
  isLiveBaseUrl,
  isPaperBaseUrl,
  isLiveFlag,
  assertPaperOnly,
  isPaperSubmitEnabled,
  createAlpacaPaperClient,
  submitPaperOrder,
  fetchPaperAccountSnapshot,
};
