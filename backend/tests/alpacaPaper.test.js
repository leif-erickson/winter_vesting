'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PAPER_BASE_URL,
  LIVE_BASE_URL,
  isLiveBaseUrl,
  assertPaperOnly,
  isPaperSubmitEnabled,
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
    return { id: 'ord-paper-1' };
  };
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

  it('defaults ALPACA_SUBMIT_PAPER off and does not call createOrder', async () => {
    resetFake();
    assert.equal(isPaperSubmitEnabled({}), false);
    assert.equal(isPaperSubmitEnabled({ ALPACA_SUBMIT_PAPER: '0' }), false);
    const client = createAlpacaPaperClient({
      env: { ALPACA_API_KEY: 'PKTEST', ALPACA_SECRET_KEY: 'secret' },
      Alpaca: FakeAlpaca,
    });
    const result = await submitPaperOrder(
      client,
      { symbol: 'SOFI', side: 'buy', qty: 1 },
      { env: {} }
    );
    assert.equal(result.submitted, false);
    assert.equal(result.reason, 'submit_disabled');
    assert.equal(client.orders.length, 0);
  });

  it('submits to the paper API only when ALPACA_SUBMIT_PAPER=1', async () => {
    resetFake();
    const client = createAlpacaPaperClient({
      env: { ALPACA_API_KEY: 'PKTEST', ALPACA_SECRET_KEY: 'secret' },
      Alpaca: FakeAlpaca,
    });
    const result = await submitPaperOrder(
      client,
      { symbol: 'SOFI', side: 'buy', qty: 0.5, type: 'market' },
      { env: { ALPACA_SUBMIT_PAPER: '1' } }
    );
    assert.equal(result.submitted, true);
    assert.equal(result.brokerOrderId, 'ord-paper-1');
    assert.equal(result.paper, true);
    assert.equal(client.orders[0].symbol, 'SOFI');
    assert.equal(client.orders[0].type, 'market');
  });

  it('refuses submit when ALPACA_LIVE is set even if submit flag is on', async () => {
    resetFake();
    const client = { createOrder: async () => ({ id: 'should-not-run' }) };
    await assert.rejects(
      () => submitPaperOrder(
        client,
        { symbol: 'SOFI', side: 'buy', qty: 1 },
        { env: { ALPACA_SUBMIT_PAPER: '1', ALPACA_LIVE: '1' } }
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
