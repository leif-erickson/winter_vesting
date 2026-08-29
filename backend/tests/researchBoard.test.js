'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rankNextToExplore, normalizeIdea, LEDGER_FIELDS, NEXT_ACTIONS, SCHOOL_BOOKS, TRACKS } = require('../lib/research');
const {
  MIN_OOS_TRADES,
  DECLARED_ORB_OOS_N,
  SQN_MIN_N,
  TIA_DRIVE_FOLDER,
  GANN_PDF_ID,
  RESEARCH_BOOKS,
  CATALOG_IDEAS,
  boardSnapshot,
  mergeExploreQueue,
  sqnSnapshot,
  PAPER_SAMPLE,
  FILED_EVENTS,
  CME_TRADING_HOURS,
  sessionClocksSnapshot,
} = require('../lib/researchBoard');
const { SETUPS, PROMOTION_GATES, loadConfig, edgeSnapshot } = require('../lib/config');
const { createMemoryStore } = require('../lib/store');

describe('research board / next-to-explore ledger', () => {
  it('declares optional ledger fields and ranks exploring/paper before inbox', () => {
    assert.deepEqual(LEDGER_FIELDS, [
      'school', 'book', 'track', 'timeframe', 'instrumentFamily', 'nextAction', 'sourceUrl',
    ]);
    const ranked = rankNextToExplore([
      { id: 3, title: 'inbox later', status: 'inbox', hypothesis: 'x' },
      { id: 1, title: 'exploring first', status: 'exploring', hypothesis: 'x' },
      { id: 2, title: 'paper second', status: 'paper', hypothesis: 'x' },
      { id: 4, title: 'rejected out', status: 'rejected', hypothesis: 'x' },
      { id: 5, title: 'parked out', status: 'parked', hypothesis: 'x' },
    ]);
    assert.deepEqual(ranked.map((i) => i.title), [
      'exploring first',
      'paper second',
      'inbox later',
    ]);
    assert.equal(ranked.every((i) => i.liveEligible === false), true);
  });

  it('never promotes live-eligible from a ranking even if a row claims it', () => {
    const ranked = rankNextToExplore([
      { id: 1, title: 'sneaky', status: 'exploring', liveEligible: true, hypothesis: 'x' },
    ]);
    assert.equal(ranked[0].liveEligible, false);
    const board = boardSnapshot({ ideas: ranked, setups: SETUPS });
    assert.equal(board.liveEligibleFromBoard, false);
    assert.equal(board.execution, 'paper');
    assert.equal(board.setupRanking, null);
    assert.equal(board.honesty.minOosTrades, 8);
    assert.equal(board.honesty.minOosTrades, PROMOTION_GATES.minOosTrades);
    assert.equal(board.honesty.onlySetupWithOosPath, 'orb_breakout');
    assert.equal(board.honesty.orbBreakoutOosN, 2);
    assert.equal(board.honesty.sqn.computed, false);
    assert.equal(board.honesty.inventedRanking, false);
    assert.equal(board.honesty.live, false);
    assert.match(board.honesty.note, /unmeasured/);
    const orb = board.honesty.setups.find((s) => s.id === 'orb_breakout');
    assert.equal(orb.status, 'unmeasured');
    assert.equal(orb.oosTrades, 2);
    assert.equal(orb.liveEligible, false);
  });

  it('treats Gann and Tori as books, not SETUPS facets', () => {
    const gann = RESEARCH_BOOKS.find((b) => b.id === 'gann_swing');
    const tori = RESEARCH_BOOKS.find((b) => b.id === 'tori_trendlines');
    const overnight = RESEARCH_BOOKS.find((b) => b.id === 'overnight_swing');
    assert.equal(gann.school, 'gann');
    assert.equal(gann.track, 'tia_gann_swing');
    assert.equal(gann.timeframe, 'D/W');
    assert.equal(gann.status, 'exploring');
    assert.equal(gann.nextAction, 'specify');
    assert.equal(tori.school, 'tori');
    assert.equal(tori.track, 'tori_trendline');
    assert.equal(tori.timeframe, '4h');
    assert.equal(overnight, undefined);
    assert.equal([...SCHOOL_BOOKS].join(','), 'amt,brooks,tori,gann,ict_smc,orderflow');
    for (const setup of SETUPS) {
      assert.equal(setup.facets.includes('gann'), false);
      assert.equal(setup.facets.includes('tori'), false);
      assert.equal(setup.facets.includes('brooks'), false);
      assert.ok(setup.facets.length <= 5);
    }
    const orderflow = RESEARCH_BOOKS.find((b) => b.id === 'orderflow');
    assert.equal(orderflow.status, 'parked');
    assert.equal(orderflow.nextAction, 'specify');
    assert.match(orderflow.note, /NOT_IMPLEMENTED/);
    assert.equal(orderflow.instrumentFamily, 'es_nq');
    assert.equal(orderflow.venue, 'rithmic_stub');
    const stacked = RESEARCH_BOOKS.filter((b) => String(b.school || '').includes('+'));
    assert.equal(stacked.length, 0);
  });

  it('adds weekend crypto Gann and Sunday Globex NQ/ES books without live or new 5m stock facets', () => {
    const crypto = RESEARCH_BOOKS.find((b) => b.id === 'crypto_gann_swing');
    const nqes = RESEARCH_BOOKS.find((b) => b.id === 'nq_es_auction');
    const tori = RESEARCH_BOOKS.find((b) => b.id === 'tori_trendlines');
    assert.equal(crypto.schoolBook, 'gann');
    assert.equal(crypto.track, 'tia_gann_swing');
    assert.equal(crypto.instrumentFamily, 'btc_eth');
    assert.equal(crypto.timeframe, 'D/W');
    assert.equal(crypto.venue, 'ccxt_paper');
    assert.equal(crypto.status, 'exploring');
    assert.equal(crypto.nextAction, 'specify');
    assert.match(crypto.note, /18\.6/);
    assert.match(crypto.note, /Jackson Hole/);
    assert.match(crypto.note, /unmeasured/i);
    assert.equal(nqes.schoolBook, 'amt');
    assert.equal(nqes.instrumentFamily, 'es_nq');
    assert.equal(nqes.timeframe, '5m');
    assert.equal(nqes.venue, 'rithmic_stub');
    assert.equal(nqes.status, 'inbox');
    assert.equal(nqes.nextAction, 'specify');
    assert.match(nqes.note, /Globex/);
    assert.match(nqes.note, /do not implement a Globex OR detector/i);
    assert.equal(normalizeIdea({
      title: 'Crypto Gann',
      hypothesis: 'Specify the weekend book.',
      book: 'crypto_gann_swing',
    }).track, 'tia_gann_swing');
    assert.equal(tori.instrumentFamily, 'energy_metals');
    assert.equal(tori.venue, 'alpaca_paper');
    assert.match(tori.note, /not US cash/);
    assert.match(tori.note, /Fills are not live/);
    const board = boardSnapshot({ setups: SETUPS });
    assert.ok(board.books.some((b) => b.id === 'crypto_gann_swing'));
    assert.ok(board.books.some((b) => b.id === 'nq_es_auction'));
    assert.ok(board.books.some((b) => b.id === 'stock_auction_5m'));
    assert.equal(board.liveEligibleFromBoard, false);
    assert.equal(board.weekendExperimentSlot.book, 'crypto_gann_swing');
    assert.equal(board.weekendExperimentSlot.nextAction, 'specify');
    assert.equal(board.sundayQueue.book, 'nq_es_auction');
    assert.equal(board.sundayQueue.status, 'inbox');
    assert.equal(board.experimentSlot.book, 'stock_auction_5m');
    assert.equal(board.cryptoFutures.oos, false);
    assert.equal(board.cryptoFutures.label, 'unmeasured');
    assert.equal(board.honesty.cryptoFutures.oos, false);
    assert.equal(board.nextToExplore.every((i) => i.liveEligible === false), true);
    assert.ok(board.nextToExplore.some((i) => i.book === 'crypto_gann_swing' && i.status === 'exploring'));
    assert.ok(board.nextToExplore.some((i) => i.book === 'nq_es_auction' && i.status === 'inbox'));
    assert.equal(board.nextToExplore[0].book, 'crypto_gann_swing');
    for (const setup of SETUPS) {
      assert.ok(setup.facets.length >= 2 && setup.facets.length <= 5);
      assert.equal(setup.assetClass, 'stocks');
    }
    const cashFacets = SETUPS.flatMap((s) => s.facets);
    assert.equal(cashFacets.includes('crypto_gann'), false);
    assert.equal(cashFacets.includes('globex_or'), false);
  });

  it('exposes queryable session clocks and does not invent holiday hours', () => {
    const saturday = sessionClocksSnapshot(new Date('2026-08-29T17:40:00.000Z'));
    assert.equal(saturday.timezone, 'America/Denver');
    assert.equal(saturday.holidayHoursInvented, false);
    assert.equal(saturday.holidayAdjusted, false);
    assert.equal(saturday.sources.cmeTradingHours, CME_TRADING_HOURS);
    assert.equal(saturday.crypto.includesSaturday, true);
    assert.equal(saturday.regularHours.crypto.regularHoursOpen, true);
    assert.equal(saturday.regularHours.globex.regularHoursOpen, false);
    assert.equal(saturday.regularHours.usCash.regularHoursOpen, false);
    assert.match(saturday.globex.weekOpen.label, /Sunday 4:00 PM MT/);
    assert.match(saturday.globex.dailyHalt.label, /Mon–Thu 3:00–4:00 PM MT/);
    assert.match(saturday.globex.equityIndexExtraHalt.label, /2:15–2:30 PM MT/);
    const sundayOpen = sessionClocksSnapshot(new Date('2026-08-30T22:05:00.000Z'));
    assert.equal(sundayOpen.regularHours.globex.regularHoursOpen, true);
    assert.equal(sundayOpen.regularHours.usCash.regularHoursOpen, false);
    const board = boardSnapshot({ setups: SETUPS });
    assert.equal(board.sessionClocks.holidayHoursInvented, false);
    assert.equal(board.sessionClocks.sources.cmeTradingHours, 'https://www.cmegroup.com/trading-hours.html');
  });

  it('merges catalog ideas so an empty store still has a next-to-explore queue', () => {
    const queue = mergeExploreQueue([]);
    assert.ok(queue.length >= CATALOG_IDEAS.length);
    assert.equal(queue[0].status, 'exploring');
    assert.ok(queue.some((i) => i.book === 'crypto_gann_swing'));
    assert.ok(queue.some((i) => i.book === 'gann_swing'));
    assert.ok(queue.some((i) => i.book === 'tori_trendlines'));
    assert.ok(queue.some((i) => i.book === 'nq_es_auction'));
    assert.ok(queue.some((i) => i.status === 'paper'));
    assert.ok(queue.some((i) => i.status === 'inbox'));
    const statuses = queue.map((i) => i.status);
    const lastExploring = statuses.lastIndexOf('exploring');
    const firstPaper = statuses.indexOf('paper');
    const lastPaper = statuses.lastIndexOf('paper');
    const firstInbox = statuses.indexOf('inbox');
    assert.ok(lastExploring < firstPaper);
    assert.ok(lastPaper < firstInbox);
    assert.equal(queue.every((i) => i.liveEligible === false), true);
  });

  it('lets a stored exploring idea override the matching catalog book', async () => {
    const store = createMemoryStore();
    await store.insertIdea(normalizeIdea({
      title: 'Human Gann note',
      hypothesis: 'Operator filed this.',
      status: 'exploring',
      school: 'gann',
      book: 'gann_swing',
    }));
    const ideas = await store.listIdeas();
    const queue = mergeExploreQueue(ideas);
    const gannRows = queue.filter((i) => i.book === 'gann_swing');
    assert.equal(gannRows.length, 1);
    assert.equal(gannRows[0].title, 'Human Gann note');
  });

  it('exposes next-to-explore on the edge snapshot without enabling live', () => {
    const edge = edgeSnapshot(loadConfig());
    assert.equal(edge.liveEligibleFromBoard, false);
    assert.equal(edge.maxFacets, 5);
    assert.ok(edge.nextToExplore[0].status === 'exploring');
    assert.equal(MIN_OOS_TRADES, 8);
    assert.equal(edge.experimentSlot.schoolBook, 'amt');
    assert.equal(edge.experimentSlot.nextAction, 'run_wf');
    assert.ok(edge.nextActions.includes('promote_queue'));
  });

  it('does not compute SQN on orb_breakout n=2 and keeps next_action as an enum', () => {
    assert.equal(DECLARED_ORB_OOS_N, 2);
    assert.equal(SQN_MIN_N, 30);
    const sqn = sqnSnapshot(2);
    assert.equal(sqn.computed, false);
    assert.match(sqn.reason, /n<30/);
    assert.ok(NEXT_ACTIONS.has('specify'));
    assert.ok(NEXT_ACTIONS.has('run_wf'));
    assert.ok(NEXT_ACTIONS.has('promote_queue'));
    assert.equal(normalizeIdea({ title: 'x', hypothesis: 'y', nextAction: 'run_wf' }).nextAction, 'run_wf');
    const board = boardSnapshot({ setups: SETUPS });
    assert.equal(board.honesty.sqn.computed, false);
    assert.equal(board.experimentSlot.schoolBook, 'amt');
    assert.equal(CATALOG_IDEAS.some((i) => i.school === 'brooks'), true);
  });

  it('points at TIA Drive ids only and does not embed course text', () => {
    const md = fs.readFileSync(path.join(__dirname, '../../docs/RESEARCH.md'), 'utf8');
    assert.match(md, /1nyq_yaY-vvcZiS5pJxHDjAlHhI7jnbf9/);
    assert.match(md, /1YFGU7ACqUb_IiR2a2rSoQe58JJu23v2T/);
    assert.match(md, /Do not copy TIA, Tori, Brooks/);
    assert.match(md, /unmeasured/);
    assert.match(md, /orb_breakout/);
    assert.match(md, /OOS \*\*n=2\*\*/);
    assert.match(md, /august-andersen\/trading-hypothesis-workflow/);
    assert.match(md, /charlesbx\/quant-research-lab-template/);
    assert.match(md, /ssrn.com\/abstract=2326253/);
    assert.match(md, /Never stack/);
    assert.match(md, /TradePad 0–14/);
    assert.match(md, /toritradez.com/);
    assert.match(md, /tradezella.com\/strategies\/trendline-strategy/);
    assert.match(md, /tiainvestor.com\/what-is-tia/);
    assert.match(md, /tia-gann-swing-indicator/);
    assert.match(md, /not Square of 9/i);
    assert.match(md, /do not drop below 4H/);
    assert.match(md, /Scribd/);
    assert.match(md, /1HhVMgiHWlTJaezczhZhuaEc3POdpzDWd/);
    assert.match(md, /11HXvYMnL1FtVh1_rSysN2c69EeQO8p1D/);
    assert.match(md, /1IxWVMr9jtN9vvRB0_8TEgW6PYKgoWqDG/);
    assert.match(md, /track=tori_trendline/);
    assert.match(md, /track=tia_gann_swing/);
    assert.match(md, /crypto_gann_swing/);
    assert.match(md, /nq_es_auction/);
    assert.match(md, /cmegroup.com\/trading-hours.html/);
    assert.match(md, /2026-09-07/);
    assert.match(md, /Jackson Hole/);
    assert.doesNotMatch(md, /Monday 2026-09-01 is Labor Day/);
    assert.doesNotMatch(md, /SQN = .*sqrt/i);
    assert.match(TIA_DRIVE_FOLDER, /1nyq_yaY-vvcZiS5pJxHDjAlHhI7jnbf9/);
    assert.equal(GANN_PDF_ID, '1YFGU7ACqUb_IiR2a2rSoQe58JJu23v2T');
    assert.doesNotMatch(md, /square of nine lesson/i);
    assert.ok(TRACKS.has('tori_trendline'));
    assert.ok(TRACKS.has('tia_gann_swing'));
  });

  it('records the verified Aug 2026 paper sample as OOS vs journal, not a ranking', () => {
    const { HIGH_BETA, DEFAULT_UNIVERSE } = require('../lib/config');
    assert.ok(HIGH_BETA.includes('QQQ'));
    assert.equal(DEFAULT_UNIVERSE.includes('QQQ'), false);
    const board = boardSnapshot({ setups: SETUPS });
    assert.equal(board.setupRanking, null);
    assert.equal(board.honesty.inventedRanking, false);
    assert.equal(board.honesty.setupBySymbolOosMatrix, false);
    assert.equal(board.honesty.rankingsEndpoint.status, 404);
    assert.equal(board.honesty.rankingsEndpoint.endpoint, 'GET /trading/rankings');
    assert.equal(board.honesty.sample.source, 'leif API paper replay');
    assert.equal(board.honesty.sample.window.start, '2026-08-10');
    assert.equal(board.honesty.sample.window.end, '2026-08-28');
    assert.equal(board.honesty.sample.live, false);
    assert.equal(board.honesty.sample.account.startingCash, 100);
    assert.equal(board.honesty.sample.account.equity, 99.4725);
    assert.equal(board.honesty.sample.account.realizedPnl, -0.5275);
    assert.equal(board.honesty.sample.account.closedTrades, 21);
    assert.equal(board.honesty.sample.regime.featuresRegime, 'quiet');
    assert.equal(board.honesty.sample.candles.bars, 9332);
    assert.deepEqual(board.honesty.sample.candles.universe, [
      'AMZN', 'ARKK', 'BRK.B', 'MSFT', 'NVDA', 'PLTR', 'SOFI', 'TSLA',
    ]);
    assert.equal(board.honesty.gaps.qqq.inHighBeta, true);
    assert.equal(board.honesty.gaps.qqq.inCandleUniverse, false);
    assert.equal(board.honesty.gaps.qqq.addedThisPass, false);
    assert.equal(DEFAULT_UNIVERSE.includes('QQQ'), false);

    const oos = board.honesty.oos;
    assert.equal(oos.endpoint, 'GET /trading/setups');
    assert.equal(oos.pooledAcrossSymbols, true);
    assert.equal(oos.setupBySymbolMatrix, false);
    assert.equal(oos.need, 8);
    assert.equal(oos.liveEligible, false);
    assert.equal(oos.allSetupsStatus, 'paper');
    assert.equal(oos.orbBreakout.n, 2);
    assert.equal(oos.orbBreakout.winRate, 0.5);
    assert.equal(oos.orbBreakout.grossPnl, 0.637);
    assert.equal(oos.orbBreakout.label, 'unmeasured');
    assert.equal(oos.orbBreakout.legs[0].symbol, 'NVDA');
    assert.equal(oos.orbBreakout.legs[0].pnl, -0.136);
    assert.equal(oos.orbBreakout.legs[1].symbol, 'PLTR');
    assert.equal(oos.orbBreakout.legs[1].pnl, 0.773);
    const legSum = oos.orbBreakout.legs.reduce((acc, leg) => acc + leg.pnl, 0);
    assert.equal(Number(legSum.toFixed(3)), 0.637);

    const journal = board.honesty.journal;
    assert.equal(journal.label, 'unmeasured');
    assert.equal(journal.notOos, true);
    assert.equal(journal.notMostProfitable, true);
    assert.equal(journal.bySetup[0].id, 'orb_breakout');
    assert.equal(journal.bySetup[0].n, 7);
    assert.equal(journal.bySetup[0].pnl, 0.27);
    assert.equal(journal.bySymbol[0].symbol, 'AMZN');
    const pltr = journal.bySymbol.find((row) => row.symbol === 'PLTR');
    assert.equal(pltr.n, 3);
    assert.equal(pltr.pnl, 1.16);
    const fade = journal.bySetup.find((row) => row.id === 'roundtrip_fade');
    assert.equal(fade.n, 0);
    assert.match(fade.note, /cash cannot short/);
    const setupPnls = journal.bySetup.map((row) => row.pnl);
    const setupPnlDesc = [...setupPnls].sort((a, b) => b - a);
    assert.notDeepEqual(setupPnls, setupPnlDesc);
    const symbolPnls = journal.bySymbol.map((row) => row.pnl);
    const symbolPnlDesc = [...symbolPnls].sort((a, b) => b - a);
    assert.notDeepEqual(symbolPnls, symbolPnlDesc);

    assert.equal(board.honesty.frozenWindows.scored, false);
    assert.deepEqual(FILED_EVENTS.map((e) => e.date), [
      '2026-08-28', '2026-09-02', '2026-09-04', '2026-09-07', '2026-09-11', '2026-09-16',
    ]);
    assert.equal(board.news.filed.length, 6);
    assert.equal(FILED_EVENTS[0].id, 'jackson_hole_warsh');
    assert.equal(FILED_EVENTS.find((e) => e.id === 'labor_day').date, '2026-09-07');
    assert.equal(FILED_EVENTS.find((e) => e.id === 'labor_day').hoursUrl, CME_TRADING_HOURS);
    assert.equal(PAPER_SAMPLE.oos.orbBreakout.n, DECLARED_ORB_OOS_N);

    const md = fs.readFileSync(path.join(__dirname, '../../docs/RESEARCH.md'), 'utf8');
    assert.match(md, /leif API/);
    assert.match(md, /99\.4725/);
    assert.match(md, /HIGH_BETA/);
    assert.match(md, /DEFAULT_UNIVERSE/);
    assert.match(md, /not silently added/);
    assert.match(md, /GET \/trading\/rankings/);
    assert.match(md, /2026-09-04/);
    assert.match(md, /2026-09-11/);
    assert.match(md, /2026-09-16/);
    assert.match(md, /Journal fills \(not OOS\)/);
    assert.doesNotMatch(md, /most-profitable setup/i);
    assert.doesNotMatch(md, /QQQ is now in DEFAULT_UNIVERSE/);

    const indexSrc = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.doesNotMatch(indexSrc, /\/trading\/rankings/);
  });
});
