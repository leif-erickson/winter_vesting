'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStore } = require('../lib/store');
const { normalizeEvent, normalizeIdea, flattenBars } = require('../lib/research');
const { getAgentContext } = require('../lib/agent');
const { loadConfig } = require('../lib/config');

describe('research events / ideas / candles', () => {
  it('stores a macro note with a citation URL, not as a live signal', async () => {
    const store = createMemoryStore();
    const event = normalizeEvent({
      kind: 'macro',
      source: 'lynalden.com',
      title: 'Liquidity / fiscal regime note',
      url: 'https://www.lynalden.com/',
      body: 'Short researcher note. Full article stays at the URL.',
      symbols: ['TLT', 'GLD'],
    });
    const row = await store.insertEvent(event);
    assert.equal(row.kind, 'macro');
    assert.equal(row.source, 'lynalden.com');
    assert.ok(row.url.includes('lynalden.com'));
    const listed = await store.listEvents({ kind: 'macro' });
    assert.equal(listed.length, 1);
  });

  it('accepts a Slack/Grokbot idea as inbox hypothesis, not a fill', async () => {
    const store = createMemoryStore();
    const idea = normalizeIdea({
      title: 'Skip ORB on CPI days',
      hypothesis: 'Opening-range breakouts fail more often on CPI mornings. Paper this filter.',
      source: 'slack',
      slackChannel: 'C123',
      slackTs: '1710000000.000100',
      symbols: ['SPY'],
    });
    const row = await store.insertIdea(idea);
    assert.equal(row.status, 'inbox');
    assert.equal(row.source, 'slack');
    assert.equal(row.slack_ts, '1710000000.000100');
    assert.equal(row.school, null);
    assert.equal(row.book, null);
    const updated = await store.updateIdea(row.id, { status: 'exploring' });
    assert.equal(updated.status, 'exploring');
  });

  it('upserts candle bars for later technique research', async () => {
    const store = createMemoryStore();
    const bars = flattenBars({
      SOFI: [{
        symbol: 'SOFI',
        ts: '2024-03-04T14:35:00.000Z',
        open: 10, high: 10.2, low: 9.9, close: 10.1,
        volume: 1000,
        sessionDate: '2024-03-04',
        minuteOfDay: 575,
        synthetic: true,
      }],
    });
    const result = await store.upsertCandles(bars);
    assert.equal(result.upserted, 1);
    await store.upsertCandles(bars);
    const stats = await store.candleStats();
    assert.equal(stats.bars, 1);
    const candles = await store.listCandles({ symbol: 'SOFI', sessionDate: '2024-03-04' });
    assert.equal(candles.length, 1);
    assert.equal(Number(candles[0].close), 10.1);
  });

  it('agent context tells Grokbot how to contribute without enabling live', async () => {
    const store = createMemoryStore();
    await store.insertIdea(normalizeIdea({
      title: 'VWAP fade',
      hypothesis: 'Fade first VWAP touch on high rvol.',
      source: 'grokbot',
    }));
    const ctx = await getAgentContext(store, loadConfig({ GOAL_DOUBLE_DAYS: '365' }));
    assert.equal(ctx.execution.liveRobinhood, false);
    assert.equal(ctx.goals.isPromotionGate, false);
    assert.ok(ctx.namedEdge);
    assert.equal(ctx.maxFacets, 5);
    assert.equal(ctx.schools.amt.gateEntries, false);
    assert.equal(ctx.schools.smc.gateEntries, false);
    assert.equal(ctx.schools.orderflow.status, 'parked');
    assert.equal(ctx.schools.gann.status, 'swing_book');
    assert.equal(ctx.schools.tori.status, 'swing_book');
    assert.equal(ctx.liveEligibleFromBoard, false);
    assert.equal(ctx.setupRanking, null);
    assert.equal(ctx.honesty.journal.label, 'unmeasured');
    assert.equal(ctx.honesty.oos.orbBreakout.n, 2);
    assert.equal(ctx.honesty.inventedRanking, false);
    assert.match(ctx.howToContribute.board, /OOS vs journal/);
    assert.match(ctx.howToContribute.board, /Never a fake setup ranking/);
    assert.ok(ctx.nextToExplore.length >= 1);
    assert.equal(ctx.nextToExplore.every((i) => i.liveEligible === false), true);
    assert.match(ctx.howToContribute.board, /\/research\/board/);
    assert.match(ctx.howToContribute.doNot, /school_books/);
    assert.ok(ctx.frozenWindows.length >= 2);
    assert.equal(ctx.assetBooks.stocks.venue, 'alpaca_paper');
    assert.ok(ctx.openIdeas.length >= 1);
    assert.match(ctx.howToContribute.idea, /\/agent\/ideas/);
    assert.match(ctx.howToContribute.edge, /\/research\/edge/);
    assert.match(ctx.howToContribute.doNot, /live Robinhood/);
  });

  it('persists optional ledger fields without breaking old ideas', async () => {
    const store = createMemoryStore();
    const idea = normalizeIdea({
      title: 'Gann swing book',
      hypothesis: 'Unpark Gann as a swing book, not a 5m facet.',
      source: 'ui',
      school: 'gann',
      book: 'gann_swing',
      timeframe: 'swing',
      instrumentFamily: 'stocks',
      nextAction: 'specify',
      sourceUrl: 'https://drive.google.com/drive/folders/1nyq_yaY-vvcZiS5pJxHDjAlHhI7jnbf9',
    });
    const row = await store.insertIdea(idea);
    assert.equal(row.school, 'gann');
    assert.equal(row.book, 'gann_swing');
    assert.equal(row.timeframe, 'swing');
    assert.equal(row.instrument_family, 'stocks');
    assert.equal(row.next_action, 'specify');
    assert.equal(row.track, 'tia_gann_swing');
    assert.ok(row.source_url.includes('1nyq_yaY-vvcZiS5pJxHDjAlHhI7jnbf9'));
    const patched = await store.updateIdea(row.id, {
      status: 'exploring',
      nextAction: 'paper_forward',
    });
    assert.equal(patched.status, 'exploring');
    assert.equal(patched.next_action, 'paper_forward');
    assert.equal(patched.book, 'gann_swing');
  });
});
