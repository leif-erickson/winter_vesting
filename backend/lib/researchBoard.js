'use strict';

const { rankNextToExplore, publicIdea, NEXT_ACTIONS, SCHOOL_BOOKS, TRACKS } = require('./research');

const MIN_OOS_TRADES = 8;
const DECLARED_ORB_OOS_N = 2;
const SQN_MIN_N = 30;
const SQN_CAP_N = 100;

/**
 * Paper research ledger. Pointers only — no course dumps.
 * Live stays off. This board never marks live-eligible.
 */

const TIA_DRIVE_FOLDER = 'https://drive.google.com/drive/folders/1nyq_yaY-vvcZiS5pJxHDjAlHhI7jnbf9';
const GANN_PDF_ID = '1YFGU7ACqUb_IiR2a2rSoQe58JJu23v2T';
const GANN_PDF_URL = `https://drive.google.com/file/d/${GANN_PDF_ID}`;
const GANN_OVERBALANCE_2025_ID = '1HhVMgiHWlTJaezczhZhuaEc3POdpzDWd';
const GANN_TIME_2023_ID = '11HXvYMnL1FtVh1_rSysN2c69EeQO8p1D';
const GANN_TIME_2022_ID = '1IxWVMr9jtN9vvRB0_8TEgW6PYKgoWqDG';
const TORI_OFFICIAL = 'https://toritradez.com/';
const TORI_TRADEZELLA = 'https://www.tradezella.com/strategies/trendline-strategy';
const TIA_WHAT = 'https://tiainvestor.com/what-is-tia/';
const TIA_GANN_INDICATOR = 'https://indicators.tiainvestor.com/tia-gann-swing-indicator';

const BLUEPRINTS = {
  walkForward: {
    names: 'Tomasini–Jaekle / Pardo',
    grade: 'stitched_oos',
    params: '2-5 with a plateau',
    links: [
      'https://www.harriman-house.com/tradingsystems',
      'https://www.wiley.com/en-us/The+Evaluation+and+Optimization+of+Trading+Strategies%2C+2nd+Edition-p-9780470128015',
    ],
  },
  pboCscv: {
    status: 'optional_later',
    note: 'Bailey–López de Prado PBO/CSCV is not a 6th facet.',
    url: 'https://ssrn.com/abstract=2326253',
  },
  measurement: {
    names: 'Van Tharp R-multiple / expectancy / SQN',
    url: 'https://www.vantharp.com/',
    sqnMinN: SQN_MIN_N,
    sqnCapN: SQN_CAP_N,
    sizeLiveFromSqn: false,
  },
  amt: {
    names: 'Dalton / Steidlmayer',
    role: '5m instrument book (IB/value/participation), not extra confirms',
    links: [
      'https://www.wiley.com/en-us/Mind+Over+Markets%3A+Power+Trading+with+Market+Generated+Information%2C+Updated+Edition-p-9781118531730',
      'https://www.cmegroup.com/education/courses/market-profile.html',
    ],
  },
  brooks: {
    url: 'https://www.brookspriceaction.com/',
    note: '5m Always-In / H2 is a later day-trade slot, not this week.',
  },
  stateMachine: ['specify', 'code', 'run_is', 'run_wf', 'paper_forward', 'iterate', 'kill', 'promote_queue'],
  templates: [
    'https://github.com/august-andersen/trading-hypothesis-workflow',
    'https://github.com/charlesbx/quant-research-lab-template',
  ],
  discard: 'confluence scores (e.g. TradePad 0–14)',
};

const SOURCES = {
  copyright: 'Pointers by id/link only. Do not copy TIA, Tori, Brooks, or other course text into this repo.',
  tia: {
    names: 'TIA Investor / TIA Crypto (Jason & Michael Pizzino)',
    notSquareOfNine: true,
    official: [TIA_WHAT, TIA_GANN_INDICATOR],
    driveFolder: TIA_DRIVE_FOLDER,
    gannPdfId: GANN_PDF_ID,
    gannPdfUrl: GANN_PDF_URL,
    gannVideos: 'Gann Swing Accelerator lessons 02-09 in the Drive folder (01 missing)',
    nextWatchAfter02040708: [
      { label: 'Overbalancing 2025', id: GANN_OVERBALANCE_2025_ID },
      { label: 'TIME Analysis 2023', id: GANN_TIME_2023_ID },
      { label: 'TIME 2022', id: GANN_TIME_2022_ID },
    ],
    alsoFolders: ['Wyckoff Volume Accelerator', 'Elliott'],
    landCycle: '18.6-year LAND cycle is macro regime (whether books are open), not a 15m trigger',
    categoriesToMirror: [
      'mechanical vs pattern',
      'R-multiples (journal unit, not live size)',
      'advanced schools as separate courses/books',
      '7-step + trade log',
    ],
  },
  tori: {
    names: 'Tori Trades (Victoria Duke / ToriTradez LLC)',
    official: [TORI_OFFICIAL, TORI_TRADEZELLA],
    minTimeframe: '4h',
    publicTape: ['PL', 'CL', 'GC'],
    publicNotes: 'bounce vs 2-touch break vs 3-touch (A+); action line + opposing safety line',
    skip: ['Scribd PDFs', 'FX Replay extra rules'],
    driveId: null,
  },
  blueprints: BLUEPRINTS,
};

/** school × instrument family × timeframe × venue × status × next action + news overlay */
const RESEARCH_BOOKS = [
  {
    id: 'stock_auction_5m',
    school: 'amt',
    schoolBook: 'amt',
    kind: 'mechanical',
    instrumentFamily: 'high_beta',
    timeframe: '5m',
    venue: 'alpaca_paper',
    status: 'paper',
    newsOverlay: 'skip_nfp_cpi_fomc',
    nextAction: 'run_wf',
    note: 'Named 5m day-trade edge. OR=IB, VWAP=value, rvol=participation. This week’s experiment slot.',
  },
  {
    id: 'gann_swing',
    school: 'gann',
    schoolBook: 'gann',
    track: 'tia_gann_swing',
    kind: 'pattern',
    instrumentFamily: 'stocks',
    timeframe: 'D/W',
    venue: 'alpaca_paper',
    status: 'exploring',
    newsOverlay: 'may_run_event_mornings',
    nextAction: 'specify',
    note: 'Mechanical swing-chart (1/2/3-bar). NOT Square of 9. Unparked D/W book. Not a 6th 5m facet.',
    sourceUrl: TIA_DRIVE_FOLDER,
  },
  {
    id: 'tori_trendlines',
    school: 'tori',
    schoolBook: 'tori',
    track: 'tori_trendline',
    kind: 'pattern',
    instrumentFamily: 'public_tape',
    timeframe: '4h',
    venue: 'alpaca_paper',
    status: 'exploring',
    newsOverlay: 'may_run_event_mornings',
    nextAction: 'specify',
    note: '4H workhorse (do not drop below 4H). Official ToriTradez/TradeZella only. Never stacked on AMT or Gann.',
    sourceUrl: TORI_OFFICIAL,
  },
  {
    id: 'brooks_5m',
    school: 'brooks',
    schoolBook: 'brooks',
    kind: 'pattern',
    instrumentFamily: 'stocks',
    timeframe: '5m',
    venue: 'alpaca_paper',
    status: 'inbox',
    newsOverlay: 'skip_nfp_cpi_fomc',
    nextAction: 'specify',
    note: 'Always-In / H2 possible later day-trade slot. Not this week’s experiment.',
    sourceUrl: BLUEPRINTS.brooks.url,
  },
  {
    id: 'ict_smc',
    school: 'ict_smc',
    schoolBook: 'ict_smc',
    kind: 'overlay',
    instrumentFamily: 'es_nq',
    timeframe: '5m',
    venue: 'later_es_nq',
    status: 'inbox',
    newsOverlay: 'n/a',
    nextAction: 'specify',
    note: 'Later ES/NQ + L2. Not the default US-cash book. Optional researchTags only on the cash book.',
  },
  {
    id: 'orderflow',
    school: 'orderflow',
    schoolBook: 'orderflow',
    kind: 'parked',
    instrumentFamily: 'es_nq',
    timeframe: 'tick',
    venue: 'rithmic_stub',
    status: 'parked',
    newsOverlay: 'n/a',
    nextAction: 'specify',
    note: 'NOT_IMPLEMENTED until L2/Rithmic. Later ES/NQ. Do not invent CVD from 5m OHLCV.',
  },
  {
    id: 'tia_wyckoff',
    school: 'wyckoff',
    schoolBook: null,
    kind: 'pattern',
    instrumentFamily: 'stocks',
    timeframe: 'swing',
    venue: 'alpaca_paper',
    status: 'inbox',
    newsOverlay: 'single_name_earnings_skip',
    nextAction: 'specify',
    note: 'Later TIA course/book. Not an experiment slot.',
    sourceUrl: TIA_DRIVE_FOLDER,
  },
  {
    id: 'tia_elliott',
    school: 'elliott',
    schoolBook: null,
    kind: 'pattern',
    instrumentFamily: 'stocks',
    timeframe: 'swing',
    venue: 'alpaca_paper',
    status: 'inbox',
    newsOverlay: 'single_name_earnings_skip',
    nextAction: 'specify',
    note: 'Later TIA course/book. Not an experiment slot.',
    sourceUrl: TIA_DRIVE_FOLDER,
  },
  {
    id: 'tia_time_overlay',
    school: 'gann',
    schoolBook: null,
    kind: 'overlay',
    instrumentFamily: 'stocks',
    timeframe: 'overlay',
    venue: 'alpaca_paper',
    status: 'inbox',
    newsOverlay: 'when_overlay',
    nextAction: 'specify',
    note: 'TIME masterclasses overlay when. 18.6y LAND cycle is macro regime, not a 15m trigger.',
    sourceUrl: TIA_DRIVE_FOLDER,
  },
  {
    id: 'tia_process',
    school: 'process',
    schoolBook: null,
    kind: 'process',
    instrumentFamily: 'all',
    timeframe: 'n/a',
    venue: 'journal',
    status: 'inbox',
    newsOverlay: 'n/a',
    nextAction: 'paper_forward',
    note: 'R-multiples as journal unit. Do not size live from SQN.',
  },
];

const NEWS_OVERLAY = {
  skip_nfp_cpi_fomc: '5m auction skips NFP 2026-09-04 / CPI 2026-09-11 / FOMC 2026-09-16 mornings (already paper).',
  may_run_event_mornings: 'Gann/Tori higher-TF books may still run NFP/CPI/FOMC days.',
  single_name_earnings_skip: 'Single-name earnings skip (AVGO 2026-09-02 AC optional skip).',
  when_overlay: 'Time overlays answer when, not a 6th entry facet.',
  'n/a': 'No news overlay on this book.',
};

const FILED_EVENTS = [
  { id: 'avgo', title: 'AVGO earnings', date: '2026-09-02', session: 'AC', overlay: 'optional_skip', symbols: ['AVGO'] },
  { id: 'nfp', title: 'NFP', date: '2026-09-04', overlay: 'skip_5m_auction' },
  { id: 'cpi', title: 'CPI', date: '2026-09-11', overlay: 'skip_5m_auction' },
  { id: 'fomc', title: 'FOMC', date: '2026-09-16', overlay: 'skip_5m_auction' },
];

/**
 * Verified Aug 10–28 2026 paper replay (leif API). Frozen facts.
 * Do not invent a ranking from this. Journal is not OOS.
 */
const PAPER_SAMPLE = {
  id: 'leif_api_2026-08-10_2026-08-28',
  source: 'leif API paper replay',
  verified: true,
  window: { start: '2026-08-10', end: '2026-08-28' },
  live: false,
  account: {
    startingCash: 100,
    equity: 99.4725,
    realizedPnl: -0.5275,
    closedTrades: 21,
  },
  regime: {
    featuresRegime: 'quiet',
    allClosedTradesQuiet: true,
    note: 'All closed paper trades had features.regime=quiet.',
  },
  candles: {
    bars: 9332,
    timeframe: '5m',
    universe: ['AMZN', 'ARKK', 'BRK.B', 'MSFT', 'NVDA', 'PLTR', 'SOFI', 'TSLA'],
  },
  gaps: {
    qqq: {
      inHighBeta: true,
      inCandleUniverse: false,
      addedThisPass: false,
      note: 'QQQ is in HIGH_BETA but not in DEFAULT_UNIVERSE / this candle archive. Documented gap; not silently added this pass.',
    },
  },
  oos: {
    endpoint: 'GET /trading/setups',
    pooledAcrossSymbols: true,
    setupBySymbolMatrix: false,
    need: MIN_OOS_TRADES,
    onlySetupWithOosPath: 'orb_breakout',
    liveEligible: false,
    allSetupsStatus: 'paper',
    orbBreakout: {
      n: DECLARED_ORB_OOS_N,
      winRate: 0.5,
      grossPnl: 0.637,
      label: 'unmeasured',
      legs: [
        { symbol: 'NVDA', sessionDate: '2026-08-25', pnl: -0.136 },
        { symbol: 'PLTR', sessionDate: '2026-08-26', pnl: 0.773 },
      ],
    },
  },
  journal: {
    label: 'unmeasured',
    notOos: true,
    notMostProfitable: true,
    note: 'Journal fills are not OOS. Unmeasured, not most-profitable. Rows follow catalog / universe order, not P&L. Do not rank setups or symbols from this.',
    bySetup: [
      { id: 'orb_breakout', n: 7, pnl: 0.27 },
      { id: 'vwap_rsi_reversion', n: 1, pnl: -0.25, journalLabel: 'vwap_rsi' },
      { id: 'orb_retest', n: 5, pnl: 0.52 },
      { id: 'bar_reversal', n: 8, pnl: -1.07 },
      { id: 'impulse_hold', n: 0, pnl: 0 },
      { id: 'roundtrip_fade', n: 0, pnl: 0, note: 'cash cannot short' },
    ],
    bySymbol: [
      { symbol: 'AMZN', pnl: -0.47 },
      { symbol: 'ARKK', pnl: -0.09 },
      { symbol: 'BRK.B', pnl: -0.18 },
      { symbol: 'MSFT', pnl: -0.25 },
      { symbol: 'NVDA', pnl: -0.09 },
      { symbol: 'PLTR', n: 3, pnl: 1.16 },
      { symbol: 'SOFI', pnl: -0.30 },
      { symbol: 'TSLA', pnl: -0.31 },
    ],
  },
  rankings: {
    endpoint: 'GET /trading/rankings',
    status: 404,
    invented: false,
    note: 'No rankings endpoint. Do not invent a ranking.',
  },
  frozenWindows: {
    scored: false,
    note: 'Frozen 2025 windows are outside this sample so anomaly share cannot be scored here.',
  },
};

const CATALOG_IDEAS = [
  {
    id: 'catalog:gann-swing',
    title: 'Gann D/W swing as its own book',
    hypothesis: 'TIA Gann is mechanical swing-chart trend following, not Square of 9. Unparked D/W book. Not a 6th confirm on the 5m ORB auction. No detector this pass.',
    status: 'exploring',
    school: 'gann',
    book: 'gann_swing',
    track: 'tia_gann_swing',
    timeframe: 'D/W',
    instrumentFamily: 'stocks',
    nextAction: 'specify',
    sourceUrl: TIA_DRIVE_FOLDER,
    source: 'catalog',
    exploreRank: 1,
  },
  {
    id: 'catalog:tori-trendlines',
    title: 'Tori 4h trendlines swing book',
    hypothesis: 'Official ToriTradez/TradeZella only. 4H workhorse — do not drop below 4H. Public tape PL/CL/GC. Never stack with AMT or Gann. Skip Scribd and FX Replay extras.',
    status: 'exploring',
    school: 'tori',
    book: 'tori_trendlines',
    track: 'tori_trendline',
    timeframe: '4h',
    instrumentFamily: 'public_tape',
    nextAction: 'specify',
    sourceUrl: TORI_OFFICIAL,
    source: 'catalog',
    exploreRank: 2,
  },
  {
    id: 'catalog:orb-oos-honesty',
    title: 'orb_breakout OOS n=2 — unmeasured, no SQN',
    hypothesis: 'Verified Aug 10–28 2026 leif API paper replay: OOS n=2 WR 50% gross +$0.637 (NVDA 8/25 −$0.136 + PLTR 8/26 +$0.773). Need 8. Journal fills are unmeasured, not OOS, not most-profitable. No GET /trading/rankings. Do not invent a ranking. Do not compute SQN.',
    status: 'paper',
    school: 'amt',
    book: 'stock_auction_5m',
    timeframe: '5m',
    instrumentFamily: 'high_beta',
    nextAction: 'run_wf',
    source: 'catalog',
    exploreRank: 3,
  },
  {
    id: 'catalog:auction-news-skip',
    title: 'Skip 5m auction on NFP/CPI/FOMC mornings',
    hypothesis: 'Opening-range auction skip on NFP/CPI/FOMC mornings. Not a sixth facet. Gann/Tori higher-TF books may still run those days.',
    status: 'paper',
    school: 'amt',
    book: 'stock_auction_5m',
    timeframe: '5m',
    instrumentFamily: 'high_beta',
    nextAction: 'paper_forward',
    source: 'catalog',
    exploreRank: 4,
  },
  {
    id: 'catalog:avgo-earnings-skip',
    title: 'Skip AVGO into 2026-09-02 earnings',
    hypothesis: 'Single-name earnings skip. AVGO 2026-09-02 after close. Overlay, not a sixth 5m facet.',
    status: 'inbox',
    school: 'amt',
    book: 'stock_auction_5m',
    timeframe: '5m',
    instrumentFamily: 'single_name',
    nextAction: 'paper_forward',
    symbols: ['AVGO'],
    source: 'catalog',
    exploreRank: 5,
  },
  {
    id: 'catalog:brooks-later',
    title: 'Brooks 5m Always-In / H2 later slot',
    hypothesis: 'Possible later day-trade slot. Not this week’s experiment. Do not stack on AMT.',
    status: 'inbox',
    school: 'brooks',
    book: 'brooks_5m',
    timeframe: '5m',
    instrumentFamily: 'stocks',
    nextAction: 'specify',
    sourceUrl: BLUEPRINTS.brooks.url,
    source: 'catalog',
    exploreRank: 6,
  },
  {
    id: 'catalog:tia-wyckoff',
    title: 'TIA Wyckoff Volume Accelerator as a later book',
    hypothesis: 'Advanced school as its own course/book when explored. Not an experiment slot and not stacked on 5m ORB.',
    status: 'inbox',
    school: 'wyckoff',
    book: 'tia_wyckoff',
    timeframe: 'swing',
    instrumentFamily: 'stocks',
    nextAction: 'specify',
    sourceUrl: TIA_DRIVE_FOLDER,
    source: 'catalog',
    exploreRank: 7,
  },
  {
    id: 'catalog:tia-elliott',
    title: 'TIA Elliott as a later book',
    hypothesis: 'Advanced school as its own course/book when explored. Not an experiment slot and not stacked on 5m ORB.',
    status: 'inbox',
    school: 'elliott',
    book: 'tia_elliott',
    timeframe: 'swing',
    instrumentFamily: 'stocks',
    nextAction: 'specify',
    sourceUrl: TIA_DRIVE_FOLDER,
    source: 'catalog',
    exploreRank: 8,
  },
  {
    id: 'catalog:tia-time-overlay',
    title: 'TIA time analysis as a when-overlay',
    hypothesis: 'Time masterclasses overlay when, not extra entry facets. Facet budget stays 2–5 per setup.',
    status: 'inbox',
    school: 'gann',
    book: 'tia_time_overlay',
    timeframe: 'overlay',
    instrumentFamily: 'stocks',
    nextAction: 'specify',
    sourceUrl: TIA_DRIVE_FOLDER,
    source: 'catalog',
    exploreRank: 9,
  },
  {
    id: 'catalog:r-multiples',
    title: 'R-multiples as journal unit',
    hypothesis: 'Van Tharp R / expectancy / SQN are measurement. Paper only. Do not size live from SQN. Do not compute SQN while n<30.',
    status: 'inbox',
    school: 'process',
    book: 'tia_process',
    timeframe: 'n/a',
    instrumentFamily: 'all',
    nextAction: 'paper_forward',
    source: 'catalog',
    exploreRank: 10,
  },
  {
    id: 'catalog:ict-smc-later',
    title: 'ICT/SMC later ES/NQ book',
    hypothesis: 'Not the default US-cash book. Later ES/NQ + L2. Optional researchTags on cash stay non-confirms.',
    status: 'inbox',
    school: 'ict_smc',
    book: 'ict_smc',
    timeframe: '5m',
    instrumentFamily: 'es_nq',
    nextAction: 'specify',
    source: 'catalog',
    exploreRank: 11,
  },
  {
    id: 'catalog:4h-cross-study',
    title: 'Later 4H Tori vs Gann comparison study',
    hypothesis: 'A study, never stacked confirms. One school_book / one track per slot.',
    status: 'inbox',
    nextAction: 'specify',
    source: 'catalog',
    exploreRank: 12,
  },
];

function catalogKey(idea) {
  const book = String(idea.book || idea.book_id || '').toLowerCase();
  const title = String(idea.title || '').toLowerCase();
  const id = String(idea.id || '');
  return { id, book, title };
}

function isSameIdea(a, b) {
  const ka = catalogKey(a);
  const kb = catalogKey(b);
  if (ka.id && kb.id && ka.id === kb.id) return true;
  if (ka.book && kb.book && ka.book === kb.book && ka.title && ka.title === kb.title) return true;
  if (ka.book && kb.book && ka.book === kb.book && String(a.school || '') === String(b.school || '')) {
    return true;
  }
  if (ka.title && ka.title === kb.title) return true;
  return false;
}

function mergeExploreQueue(storedIdeas = []) {
  const stored = (storedIdeas || []).map((row) => publicIdea(row));
  const extra = CATALOG_IDEAS.filter(
    (c) => !stored.some((s) => isSameIdea(s, c))
  ).map((c) => publicIdea(c));
  return rankNextToExplore([...stored, ...extra]);
}

function orbOosN(setups = []) {
  const orb = (setups || []).find((s) => s.id === 'orb_breakout');
  const trades = Number(orb?.metrics?.trades ?? orb?.metrics?.oosTrades);
  if (Number.isFinite(trades) && trades > 0) return trades;
  return DECLARED_ORB_OOS_N;
}

function sqnSnapshot(n) {
  if (!(n >= SQN_MIN_N)) {
    return {
      computed: false,
      n,
      minN: SQN_MIN_N,
      capN: SQN_CAP_N,
      reason: 'n<30 — do not compute SQN',
    };
  }
  return {
    computed: false,
    n: Math.min(n, SQN_CAP_N),
    minN: SQN_MIN_N,
    capN: SQN_CAP_N,
    reason: 'SQN grader not implemented this pass; paper measurement only; do not size live',
  };
}

function oosHonesty(setups = []) {
  const minOosTrades = MIN_OOS_TRADES;
  const declaredN = orbOosN(setups);
  const rows = (setups || []).map((s) => {
    const fromMetrics = Number(s.metrics?.trades ?? s.metrics?.oosTrades ?? 0);
    const trades = s.id === 'orb_breakout' ? declaredN : fromMetrics;
    return {
      id: s.id,
      oosTrades: trades,
      status: trades >= minOosTrades ? 'measured' : 'unmeasured',
      liveEligible: false,
      paper: true,
    };
  });
  return {
    live: false,
    inventedRanking: false,
    setupBySymbolOosMatrix: false,
    rankingsEndpoint: PAPER_SAMPLE.rankings,
    onlySetupWithOosPath: 'orb_breakout',
    orbBreakoutOosN: declaredN,
    minOosTrades,
    sqn: sqnSnapshot(declaredN),
    note: 'OOS vs journal: only orb_breakout has OOS n=2 (unmeasured). Journal fills are unmeasured, not most-profitable. Do not invent a ranking. Do not compute SQN. Promotion still minOosTrades 8. Live off.',
    sample: PAPER_SAMPLE,
    oos: PAPER_SAMPLE.oos,
    journal: PAPER_SAMPLE.journal,
    gaps: PAPER_SAMPLE.gaps,
    events: FILED_EVENTS,
    frozenWindows: PAPER_SAMPLE.frozenWindows,
    setups: rows,
  };
}

function boardSnapshot({ ideas = [], setups = [] } = {}) {
  const honesty = oosHonesty(setups);
  return {
    liveEligibleFromBoard: false,
    execution: 'paper',
    setupRanking: null,
    honesty,
    experimentSlot: {
      schoolBook: 'amt',
      book: 'stock_auction_5m',
      setupId: 'orb_breakout',
      nextAction: 'run_wf',
      note: 'One school_book per slot. Never stack. Brooks is not this week.',
    },
    schoolBooks: [...SCHOOL_BOOKS],
    tracks: [...TRACKS],
    nextActions: [...NEXT_ACTIONS],
    labOs: BLUEPRINTS,
    books: RESEARCH_BOOKS.map((b) => ({
      ...b,
      newsNote: NEWS_OVERLAY[b.newsOverlay] || NEWS_OVERLAY['n/a'],
    })),
    nextToExplore: mergeExploreQueue(ideas),
    sources: SOURCES,
    news: {
      auction5m: NEWS_OVERLAY.skip_nfp_cpi_fomc,
      higherTfSwing: NEWS_OVERLAY.may_run_event_mornings,
      earnings: NEWS_OVERLAY.single_name_earnings_skip,
      filed: FILED_EVENTS,
    },
  };
}

module.exports = {
  MIN_OOS_TRADES,
  DECLARED_ORB_OOS_N,
  SQN_MIN_N,
  SQN_CAP_N,
  TIA_DRIVE_FOLDER,
  GANN_PDF_ID,
  GANN_PDF_URL,
  GANN_OVERBALANCE_2025_ID,
  GANN_TIME_2023_ID,
  GANN_TIME_2022_ID,
  TORI_OFFICIAL,
  TORI_TRADEZELLA,
  TIA_WHAT,
  TIA_GANN_INDICATOR,
  BLUEPRINTS,
  SOURCES,
  RESEARCH_BOOKS,
  NEWS_OVERLAY,
  FILED_EVENTS,
  PAPER_SAMPLE,
  CATALOG_IDEAS,
  mergeExploreQueue,
  oosHonesty,
  sqnSnapshot,
  boardSnapshot,
};
