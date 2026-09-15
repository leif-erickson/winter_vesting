'use strict';

/**
 * Alpaca PAPER adapter for the daily live-data PoC.
 *
 * Hard rules:
 * - Client is always constructed with paper: true.
 * - Trading host is https://paper-api.alpaca.markets.
 * - https://api.alpaca.markets (live) is refused.
 * - ALPACA_LIVE=1 is refused.
 * - Paper brokerage POSTs default ON (PAPER_BROKER_ORDERS / ALPACA_SUBMIT_PAPER).
 *   Opt out with PAPER_BROKER_ORDERS=false or ALPACA_SUBMIT_PAPER=0.
 *   Local trade_journal remains the research fill source of truth; POSTs are
 *   an additional mirror so the Alpaca paper account is not idle.
 * - Live money trading is never enabled from this adapter.
 */

const crypto = require('node:crypto');

const PAPER_BASE_URL = 'https://paper-api.alpaca.markets';
const LIVE_BASE_URL = 'https://api.alpaca.markets';
const LIVE_HOST = 'api.alpaca.markets';
const PAPER_HOST = 'paper-api.alpaca.markets';
const CLIENT_ORDER_ID_MAX = 48;

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

/**
 * Parse an env toggle. Unset / empty → null (caller applies default).
 * @returns {boolean|null}
 */
function parseToggle(value) {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (v === '') return null;
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
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

/**
 * Paper brokerage POSTs default ON so weekday paper:daily moves the Alpaca
 * paper account. Explicit false on either flag wins. Live remains gated by
 * assertPaperOnly / ALPACA_LIVE — this toggle never enables the live host.
 */
function isPaperSubmitEnabled(env = process.env) {
  const paperBroker = parseToggle(env.PAPER_BROKER_ORDERS);
  const alpacaSubmit = parseToggle(env.ALPACA_SUBMIT_PAPER);
  if (paperBroker === false || alpacaSubmit === false) return false;
  if (paperBroker === true || alpacaSubmit === true) return true;
  return true;
}

/**
 * Deterministic Alpaca client_order_id (≤48 chars) from journal identity.
 * Re-running the same fill does not double-POST (Alpaca unique constraint).
 */
function makePaperClientOrderId({ symbol, ts, setupId, side } = {}) {
  const raw = [symbol || '', ts || '', setupId || '', String(side || '').toLowerCase()].join('|');
  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 40);
  return `wv-${hash}`.slice(0, CLIENT_ORDER_ID_MAX);
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

function httpStatusOf(err) {
  return Number(err?.statusCode ?? err?.status ?? err?.response?.statusCode ?? err?.response?.status);
}

function isDuplicateClientOrderError(err) {
  const status = httpStatusOf(err);
  if (status === 409) return true;
  const msg = String(err?.message || err || '');
  return /client_order_id/i.test(msg) && /unique|already|exists|duplicate/i.test(msg);
}

async function existingOrderByClientId(client, clientOrderId) {
  if (!clientOrderId) return null;
  if (typeof client.getOrderByClientOrderId === 'function') {
    return client.getOrderByClientOrderId(clientOrderId);
  }
  if (typeof client.getByClientOrderId === 'function') {
    return client.getByClientOrderId(clientOrderId);
  }
  return null;
}

function submittedResult(created, { duplicate = false } = {}) {
  return {
    submitted: true,
    brokerOrderId: created.id || null,
    clientOrderId: created.client_order_id || created.clientOrderId || null,
    order: created,
    venue: 'alpaca-paper',
    paper: true,
    duplicate,
  };
}

/**
 * POST an order to Alpaca paper when paper submit is enabled (default on).
 * Never hits the live host. Local journal writing is the caller's job.
 */
async function submitPaperOrder(client, order, { env = process.env } = {}) {
  assertPaperOnly(env);
  if (!isPaperSubmitEnabled(env)) {
    return {
      submitted: false,
      reason: 'submit_disabled',
      message:
        'Paper broker POSTs are off (PAPER_BROKER_ORDERS=false or ALPACA_SUBMIT_PAPER=0). Local journal is still the fill source of truth. Unset the flag or set PAPER_BROKER_ORDERS=true to POST to https://paper-api.alpaca.markets.',
    };
  }
  if (!client || typeof client.createOrder !== 'function') {
    throw new Error('Alpaca paper client with createOrder is required when paper broker POSTs are enabled');
  }

  const side = String(order.side || 'buy').toLowerCase();
  const qty = String(order.qty ?? order.size ?? order.quantity ?? '');
  if (!order.symbol || !qty || Number(qty) <= 0) {
    return {
      submitted: false,
      reason: 'invalid_order',
      message: 'Paper broker POST skipped: symbol and positive qty are required.',
    };
  }

  const limit = order.limitPrice ?? order.limit_price ?? order.paperPrice;
  const requestedType = String(order.type || (limit != null ? 'limit' : 'market')).toLowerCase();
  // Daily runs after the cash close. Market + extended_hours is rejected by
  // Alpaca; a limit at the journal price with extended_hours can still POST
  // during the 4:00–20:00 ET window (weekday Action is 16:30 ET on EDT).
  const type = requestedType === 'market' && limit != null ? 'limit' : requestedType;
  const clientOrderId = String(order.clientOrderId || order.client_order_id || '').slice(0, CLIENT_ORDER_ID_MAX)
    || undefined;

  const body = {
    symbol: order.symbol,
    qty,
    side,
    type,
    time_in_force: order.timeInForce || order.time_in_force || 'day',
  };
  if (clientOrderId) body.client_order_id = clientOrderId;
  if (type === 'limit') {
    if (limit == null) {
      return {
        submitted: false,
        reason: 'invalid_order',
        message: 'Limit paper orders require paperPrice / limit_price.',
      };
    }
    body.limit_price = String(limit);
    const extended = order.extendedHours ?? order.extended_hours ?? true;
    if (extended) body.extended_hours = true;
  }

  try {
    const created = await client.createOrder(body);
    return submittedResult(created);
  } catch (err) {
    if (isDuplicateClientOrderError(err) && clientOrderId) {
      const existing = await existingOrderByClientId(client, clientOrderId);
      if (existing) return submittedResult(existing, { duplicate: true });
    }
    throw err;
  }
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
  parseToggle,
  assertPaperOnly,
  isPaperSubmitEnabled,
  makePaperClientOrderId,
  createAlpacaPaperClient,
  submitPaperOrder,
  fetchPaperAccountSnapshot,
};
