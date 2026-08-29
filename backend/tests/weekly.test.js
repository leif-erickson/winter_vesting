'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatWeeklyEdgeReport, runWeekly } = require('../lib/weekly');
const { loadConfig, NAMED_EDGE } = require('../lib/config');
const { createMemoryStore } = require('../lib/store');
const { normalizeIdea } = require('../lib/research');

describe('weekly edge report', () => {
  it('states the named edge, books, and empty experiment slot', () => {
    const md = formatWeeklyEdgeReport({
      namedEdge: NAMED_EDGE,
      rankings: [{
        setupId: 'orb_breakout',
        family: 'auction',
        facets: ['or_break', 'above_vwap', 'rvol'],
        assetClass: 'stocks',
        status: 'paper',
        liveEligible: false,
        anomalyDependent: true,
        metrics: { trades: 4, winRate: 0.5, grossPnl: 1.2 },
      }],
      trades: [{ sessionDate: '2025-10-15', pnl: 2 }, { sessionDate: '2024-03-04', pnl: 1 }],
      sessionDates: ['2025-10-15', '2024-03-04'],
      ideas: [],
    });
    assert.match(md, /Weekly edge maintenance/);
    assert.match(md, /Named edge/);
    assert.match(md, /opening range/i);
    assert.match(md, /anomaly_dependent/);
    assert.match(md, /Asset books/);
    assert.match(md, /alpaca_paper/);
    assert.match(md, /Inbox empty/);
    assert.match(md, /Frozen-window P&L/);
    assert.match(md, /initial_balance/);
    assert.match(md, /journal tags only/);
    assert.match(md, /Gann\/Tori are swing books/);
  });

  it('surfaces one exploring idea as the experiment slot', async () => {
    const store = createMemoryStore();
    await store.insertIdea(normalizeIdea({
      title: 'Skip ORB on CPI',
      hypothesis: 'Paper a CPI-morning skip, do not add a sixth facet.',
      source: 'grokbot',
    }));
    const idea = (await store.listIdeas())[0];
    await store.updateIdea(idea.id, { status: 'exploring' });
    const { markdown } = await runWeekly({ store, config: loadConfig() });
    assert.match(markdown, /Skip ORB on CPI/);
    assert.match(markdown, /exploring/);
  });
});
