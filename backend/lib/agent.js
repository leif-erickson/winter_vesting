'use strict';

const { assessGoal } = require('./goals');
const { edgeSnapshot } = require('./config');
const { boardSnapshot } = require('./researchBoard');

/**
 * Snapshot Grokbot (or any Slack agent) can fetch while this stack is running.
 * Ideas posted in Slack should be POSTed back to /agent/ideas — they land as
 * hypotheses, never as live orders.
 */
async function getAgentContext(store, config) {
  const account = await store.getAccount();
  const setups = await store.listSetups();
  const trades = await store.listTrades({ limit: 25 });
  const events = store.listEvents ? await store.listEvents({ limit: 20 }) : [];
  const ideas = store.listIdeas ? await store.listIdeas({ limit: 20 }) : [];
  const candles = store.candleStats ? await store.candleStats() : { bars: 0, symbols: [] };

  const oos = setups.reduce(
    (acc, s) => {
      const m = s.metrics || {};
      acc.pnl += Number(m.grossPnl ?? m.gross_pnl ?? 0);
      acc.sessions = Math.max(acc.sessions, Number(m.trades || 0));
      return acc;
    },
    { pnl: 0, sessions: 0 }
  );

  const goals = assessGoal({
    startingCash: Number(account.starting_cash ?? config.startingCash ?? 100),
    equity: Number(account.equity ?? config.startingCash ?? 100),
    doubleDays: config.goalDoubleDays,
    oosPnl: oos.pnl,
    oosSessions: oos.sessions,
  });

  const edge = edgeSnapshot(config);
  const board = boardSnapshot({ ideas, setups });

  return {
    intent: 'Explore US equity strategies on Alpaca paper. Live Robinhood is out of band and confirm-to-place only. $100 is a research budget, not necessarily the live account.',
    namedEdge: edge.namedEdge,
    assetBooks: edge.assetBooks,
    frozenWindows: edge.frozenWindows,
    maxFacets: edge.maxFacets,
    schools: edge.schools,
    execution: {
      venue: 'alpaca_paper',
      liveRobinhood: false,
      liveEligibleMeans: 'setup cleared walk-forward OOS gates and is not anomaly_dependent; still paper until a human confirms a specific Robinhood MCP order',
    },
    account,
    goals,
    setups,
    recentTrades: trades,
    recentEvents: events,
    openIdeas: ideas.filter((i) => i.status === 'inbox' || i.status === 'exploring'),
    nextToExplore: board.nextToExplore,
    honesty: board.honesty,
    setupRanking: null,
    liveEligibleFromBoard: false,
    candles,
    howToContribute: {
      idea: 'POST /agent/ideas {title, hypothesis, source:"slack"|"grokbot", slackChannel, slackTs, symbols[]}',
      event: 'POST /research/events {kind:"news"|"analysis"|"macro"|"indicator", source, title, url, body, symbols[]}',
      candles: 'POST /research/candles/ingest  — persist latest Alpaca/synthetic 5m bars',
      edge: 'GET /research/edge — named edge, facet budget, frozen Oct–Nov 2025 windows, asset books, next-to-explore',
      board: 'GET /research/board — books matrix, next-to-explore (status queue), and OOS vs journal honesty. Never a fake setup ranking. Never live-eligible from this.',
      weekly: edge.weekly,
      doNot: 'Do not place live Robinhood orders from this API. Do not scrape paywalled analysis into full-text dumps; store URL + a short note. Do not add facets because last week was green. Do not promote SMC/VSA journal tags or orderflow stubs into entry confirms. Do not stack school_books. Do not compute SQN while OOS n<30. Do not use confluence scores.',
    },
  };
}

module.exports = { getAgentContext };
