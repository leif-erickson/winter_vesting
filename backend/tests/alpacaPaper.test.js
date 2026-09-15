'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PAPER_BASE_URL,
  LIVE_BASE_URL,
  isLiveBaseUrl,
  assertPaperOnly,
  isPaperSubmitEnabled,
  makePaperClientOrderId,
  createAlpacaPaperClient,
  submitPaperOrder,
  fetchPaperAccountSnapshot,
} = require('../lib/alpacaPaper');

function FakeAlpaca(opts) {
  FakeAlpaca.constructed += 1;
  FakeAlpaca.last = opts;
  this.opts = opts;
  this.orders = [];
  this.createOrder = async (body) => {
    this.orders.push(body);
    FakeAlpaca.orders.push(body);
    if (FakeAlpaca.duplicateOnce) {
      FakeAlpaca.duplicateOnce = false;
      const err = new Error('client_order_id must be unique');
      err.statusCode = 409;
      throw err;
    }
    return {
      id: 'ord-paper-1',
      client_order_id: body.client_order_id || 'cid-paper-1',
      status: 'accepted',
    };
  };
  this.getOrderByClientOrderId = async (clientOrderId) => ({
    id: 'ord-existing',
    client_order_id: clientOrderId,
    status: 'filled',
  });
  this.getAccount = async () => ({
    equity: '100000',
    cash: '99000',
    buying_power: '198000',
  });
  this.getPositions = async () => [{ symbol: 'SOFI' }];
}

function resetFake() {
  FakeAlpaca.constructed = 0;
  FakeAlpaca.last = null;
  FakeAlpaca.orders = [];
  FakeAlpaca.duplicateOnce = false;
}

describe('Alpaca paper adapter', () => {
  it('identifies the live trading host and not the paper host', () => {
    assert.equal(isLiveBaseUrl(LIVE_BASE_URL), true);
    assert.equal(isLiveBaseUrl('https://api.alpaca.markets/'), true);
    assert.equal(isLiveBaseUrl(PAPER_BASE_URL), false);
    assert.equal(isLiveBaseUrl('https://paper-api.alpaca.markets'), false);
  });

  it('refuses ALPACA_LIVE=1', () => {
    assert.throws(
      () => assertPaperOnly({ ALPACA_LIVE: '1' }),
      (err) => err.code === 'ALPACA_LIVE_REFUSED'
    );
  });

  it('refuses a live base URL and never constructs a client', () => {
    resetFake();
    assert.throws(
      () => createAlpacaPaperClient({
        env: {
          ALPACA_API_KEY: 'PKTEST',
          ALPACA_SECRET_KEY: 'secret',
          ALPACA_BASE_URL: LIVE_BASE_URL,
        },
        Alpaca: FakeAlpaca,
      }),
      /live/
    );
    assert.equal(FakeAlpaca.constructed, 0);

    assert.throws(
      () => createAlpacaPaperClient({
        env: {
          ALPACA_API_KEY: 'PKTEST',
          ALPACA_SECRET_KEY: 'secret',
          APCA_API_BASE_URL: 'https://api.alpaca.markets',
        },
        Alpaca: FakeAlpaca,
      }),
      (err) => err.code === 'ALPACA_LIVE_REFUSED'
    );
    assert.equal(FakeAlpaca.constructed, 0);
  });

  it('constructs a paper=true client against the paper host', () => {
    resetFake();
    const client = createAlpacaPaperClient({
      env: { ALPACA_API_KEY: 'PKTEST', ALPACA_SECRET_KEY: 'secret' },
      Alpaca: FakeAlpaca,
    });
    assert.equal(FakeAlpaca.constructed, 1);
    assert.equal(FakeAlpaca.last.paper, true);
    assert.equal(FakeAlpaca.last.baseUrl, PAPER_BASE_URL);
    assert.equal(client.opts.paper, true);
  });

  it('defaults paper broker POSTs on (unset flags)', () => {
    assert.equal(isPaperSubmitEnabled({}), true);
    assert.equal(isPaperSubmitEnabled({ ALPACA_SUBMIT_PAPER: '' }), true);
    assert.equal(isPaperSubmitEnabled({ PAPER_BROKER_ORDERS: 'true' }), true);
    assert.equal(isPaperSubmitEnabled({ ALPACA_SUBMIT_PAPER: '1' }), true);
  });

  it('opts out of paper POSTs when PAPER_BROKER_ORDERS or ALPACA_SUBMIT_PAPER is false', async () => {
    resetFake();
    assert.equal(isPaperSubmitEnabled({ ALPACA_SUBMIT_PAPER: '0' }), false);
    assert.equal(isPaperSubmitEnabled({ PAPER_BROKER_ORDERS: 'false' }), false);
    assert.equal(isPaperSubmitEnabled({ PAPER_BROKER_ORDERS: 'true', ALPACA_SUBMIT_PAPER: '0' }), false);
    const client = createAlpacaPaperClient({
      env: { ALPACA_API_KEY: 'PKTEST', ALPACA_SECRET_KEY: 'secret' },
      Alpaca: FakeAlpaca,
    });
    const result = await submitPaperOrder(
      client,
      { symbol: 'SOFI', side: 'buy', qty: 1 },
      { env: { PAPER_BROKER_ORDERS: 'false' } }
    );
    assert.equal(result.submitted, false);
    assert.equal(result.reason, 'submit_disabled');
    assert.equal(client.orders.length, 0);
  });

  it('POSTs to the paper API by default and records broker + client order ids', async () => {
    resetFake();
    const client = createAlpacaPaperClient({
      env: { ALPACA_API_KEY: 'PKTEST', ALPACA_SECRET_KEY: 'secret' },
      Alpaca: FakeAlpaca,
    });
    const result = await submitPaperOrder(
      client,
      {
        symbol: 'SOFI',
        side: 'buy',
        qty: 0.5,
        type: 'market',
        paperPrice: 12.4,
        clientOrderId: 'wv-test-sofi-buy',
      },
      { env: {} }
    );
    assert.equal(result.submitted, true);
    assert.equal(result.brokerOrderId, 'ord-paper-1');
    assert.equal(result.clientOrderId, 'wv-test-sofi-buy');
    assert.equal(result.paper, true);
    assert.equal(result.venue, 'alpaca-paper');
    assert.equal(client.orders[0].symbol, 'SOFI');
    assert.equal(client.orders[0].type, 'limit');
    assert.equal(client.orders[0].limit_price, '12.4');
    assert.equal(client.orders[0].extended_hours, true);
    assert.equal(client.orders[0].client_order_id, 'wv-test-sofi-buy');
    assert.equal(FakeAlpaca.last.baseUrl, PAPER_BASE_URL);
  });

  it('treats a duplicate client_order_id as the existing paper order', async () => {
    resetFake();
    FakeAlpaca.duplicateOnce = true;
    const client = createAlpacaPaperClient({
      env: { ALPACA_API_KEY: 'PKTEST', ALPACA_SECRET_KEY: 'secret' },
      Alpaca: FakeAlpaca,
    });
    const result = await submitPaperOrder(
      client,
      { symbol: 'SOFI', side: 'buy', qty: 1, paperPrice: 10, clientOrderId: 'wv-dup' },
      { env: { PAPER_BROKER_ORDERS: 'true' } }
    );
    assert.equal(result.submitted, true);
    assert.equal(result.duplicate, true);
    assert.equal(result.brokerOrderId, 'ord-existing');
    assert.equal(result.clientOrderId, 'wv-dup');
  });

  it('builds a stable client_order_id within Alpaca\'s 48-char cap', () => {
    const a = makePaperClientOrderId({
      symbol: 'SOFI',
      ts: '2026-09-15T10:00:00-04:00',
      setupId: 'orb_breakout',
      side: 'BUY',
    });
    const b = makePaperClientOrderId({
      symbol: 'SOFI',
      ts: '2026-09-15T10:00:00-04:00',
      setupId: 'orb_breakout',
      side: 'buy',
    });
    const other = makePaperClientOrderId({
      symbol: 'SOFI',
      ts: '2026-09-15T10:00:00-04:00',
      setupId: 'orb_breakout',
      side: 'sell',
    });
    assert.equal(a, b);
    assert.notEqual(a, other);
    assert.ok(a.startsWith('wv-'));
    assert.ok(a.length <= 48);
  });

  it('refuses submit when ALPACA_LIVE is set even if paper submit flags are on', async () => {
    resetFake();
    const client = { createOrder: async () => ({ id: 'should-not-run' }) };
    await assert.rejects(
      () => submitPaperOrder(
        client,
        { symbol: 'SOFI', side: 'buy', qty: 1 },
        { env: { ALPACA_SUBMIT_PAPER: '1', PAPER_BROKER_ORDERS: 'true', ALPACA_LIVE: '1' } }
      ),
      (err) => err.code === 'ALPACA_LIVE_REFUSED'
    );
  });

  it('returns a PAPER-labeled read-only account snapshot', async () => {
    resetFake();
    const client = createAlpacaPaperClient({
      env: { ALPACA_API_KEY: 'PKTEST', ALPACA_SECRET_KEY: 'secret' },
      Alpaca: FakeAlpaca,
    });
    const snap = await fetchPaperAccountSnapshot(client);
    assert.equal(snap.ok, true);
    assert.equal(snap.paper, true);
    assert.equal(snap.label, 'PAPER');
    assert.equal(snap.equity, 100000);
    assert.equal(snap.cash, 99000);
    assert.equal(snap.buyingPower, 198000);
    assert.equal(snap.positionsCount, 1);
  });
});
