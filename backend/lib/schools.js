'use strict';

/**
 * Paper-only mapping of industrial trading schools onto books.
 * AMT labels existing 5m auction facets. SMC/VSA may tag the journal.
 * Gann and Tori are swing books, not 5m facets. Orderflow stays parked.
 */

const AMT_ROLES = {
  initial_balance: '15-minute opening range (initial balance)',
  value: 'session VWAP (auction value)',
  participation: 'relative volume (participation)',
};

/** Facet id → AMT role. Unmapped facets (rsi, pin, extension) stay unlabeled. */
const FACET_TO_AMT = {
  or_break: 'initial_balance',
  prior_or_break: 'initial_balance',
  or_or_structure_break: 'initial_balance',
  above_vwap: 'value',
  mid_vwap_touch: 'value',
  at_vwap: 'value',
  vwap_reclaim: 'value',
  vwap_loss_or_engulf: 'value',
  rvol: 'participation',
};

const SMC_TAGS = ['liquidity_sweep', 'fvg', 'order_block', 'bos'];
const VSA_TAGS = ['effort_vs_result', 'no_demand'];

const NON_ENTRY_NAMES = [
  ...Object.keys(AMT_ROLES),
  ...SMC_TAGS,
  ...VSA_TAGS,
  'amt',
  'researchTags',
  'gann',
  'tori',
  'trendline',
  'action_line',
  'safety_line',
  'wyckoff',
  'elliott',
  'time_square',
  'brooks',
  'always_in',
  'h2',
  'ict',
  'ict_smc',
  'pbo',
  'cscv',
  'sqn',
  'confluence',
  'square_of_nine',
  'cvd',
  'delta',
  'footprint',
  'dom',
];

const PARKED = {
  orderflow: {
    status: 'parked',
    gateEntries: false,
    note: 'Footprint/delta/DOM/CVD needs signed tape. OrderflowSession throws NOT_IMPLEMENTED. Do not invent tick or L2 from 5m OHLCV.',
  },
};

const SWING_BOOKS = {
  gann: {
    status: 'swing_book',
    gateEntries: false,
    book: 'gann_swing',
    timeframe: 'D/W',
    note: 'Unparked D/W TIA mechanical swing-chart (not Square of 9). Track=tia_gann_swing. Weekend/24h path is crypto_gann_swing (BTC/ETH, ccxt_paper). Not a 6th 5m ORB facet. Never stack.',
  },
  tori: {
    status: 'swing_book',
    gateEntries: false,
    book: 'tori_trendlines',
    timeframe: '4h',
    note: '4H workhorse (do not drop below 4H). Energy/metals futures (CL/PL/GC), not US cash. Track=tori_trendline. Official ToriTradez/TradeZella only. Not stacked on 5m ORB or on Gann. Fills not live.',
  },
};

const LATER_BOOKS = {
  brooks: {
    status: 'later_slot',
    gateEntries: false,
    book: 'brooks_5m',
    note: '5m Always-In / H2 possible later day-trade slot. Not this week’s experiment.',
  },
  ict_smc: {
    status: 'later_es_nq',
    gateEntries: false,
    book: 'ict_smc',
    note: 'Later ES/NQ + L2. Not the default US-cash book.',
  },
};

function amtMapForFacets(facets) {
  const amt = {};
  for (const facet of facets || []) {
    const role = FACET_TO_AMT[facet];
    if (role) amt[facet] = role;
  }
  return amt;
}

function assertAmtIsNotAFacet(setups) {
  for (const setup of setups || []) {
    for (const facet of setup.facets || []) {
      if (NON_ENTRY_NAMES.includes(facet)) {
        throw new Error(`setup ${setup.id} must not declare school label "${facet}" as an entry facet`);
      }
    }
  }
}

function isLiquiditySweep(bar) {
  if (!bar) return false;
  if (bar.orHigh != null && bar.high > bar.orHigh && bar.close < bar.orHigh) return true;
  if (bar.orLow != null && bar.low < bar.orLow && bar.close > bar.orLow) return true;
  if (bar.swingHigh != null && bar.high > bar.swingHigh && bar.close < bar.swingHigh) return true;
  if (bar.swingLow != null && bar.low < bar.swingLow && bar.close > bar.swingLow) return true;
  return false;
}

function isFvg(annotated, index) {
  if (!Array.isArray(annotated) || index < 2) return false;
  const a = annotated[index - 2];
  const c = annotated[index];
  if (!a || !c) return false;
  return a.high < c.low || a.low > c.high;
}

function isOrderBlock(annotated, index) {
  if (!Array.isArray(annotated) || index < 1) return false;
  const prev = annotated[index - 1];
  const bar = annotated[index];
  if (!prev || !bar) return false;
  const prevBear = prev.close < prev.open;
  const barBull = bar.close > bar.open;
  return prevBear && barBull && bar.close > prev.high;
}

function isBos(bar, prev) {
  if (!bar || !prev || bar.swingHigh == null) return false;
  return bar.close > bar.swingHigh && prev.close <= bar.swingHigh;
}

function isEffortVsResult(bar) {
  if (!bar || !(Number(bar.rvol) >= 1.5)) return false;
  const range = Number(bar.high) - Number(bar.low);
  const body = Math.abs(Number(bar.close) - Number(bar.open));
  if (!(range > 0)) return false;
  return body / range <= 0.4;
}

function isNoDemand(bar, prev) {
  if (!bar || !prev) return false;
  if (!(bar.close > bar.open)) return false;
  if (!(Number(bar.rvol) < 1.0)) return false;
  return Number(bar.volume) < Number(prev.volume);
}

/**
 * Optional SMC/VSA notes from 5m OHLCV geometry. Empty is valid.
 * Never used as an entry gate. Not orderflow (no tick, no L2, no CVD).
 */
function researchTagsFrom(annotated, index) {
  if (!Array.isArray(annotated) || index == null || index < 0) return [];
  const bar = annotated[index];
  const prev = index > 0 ? annotated[index - 1] : null;
  if (!bar) return [];
  const tags = [];
  if (isLiquiditySweep(bar)) tags.push('liquidity_sweep');
  if (isFvg(annotated, index)) tags.push('fvg');
  if (isOrderBlock(annotated, index)) tags.push('order_block');
  if (isBos(bar, prev)) tags.push('bos');
  if (isEffortVsResult(bar)) tags.push('effort_vs_result');
  if (isNoDemand(bar, prev)) tags.push('no_demand');
  return tags;
}

function schoolSnapshot(setups) {
  return {
    amt: {
      namedEdge: { ...AMT_ROLES },
      facetMap: { ...FACET_TO_AMT },
      bySetup: Object.fromEntries(
        (setups || []).map((s) => [s.id, amtMapForFacets(s.facets)])
      ),
      note: 'Labels on the existing 2–5 named facets. Not extra confirms.',
      gateEntries: false,
    },
    smc: {
      tags: [...SMC_TAGS],
      gateEntries: false,
      note: 'Optional journal researchTags from 5m geometry for later ranking. Signals fire when these tags are absent. Instrument-specific later book if ever.',
    },
    vsa: {
      tags: [...VSA_TAGS],
      gateEntries: false,
      note: 'Optional journal researchTags (effort vs result / no-demand). Not entry facets.',
    },
    orderflow: { ...PARKED.orderflow },
    gann: { ...SWING_BOOKS.gann },
    tori: { ...SWING_BOOKS.tori },
    brooks: { ...LATER_BOOKS.brooks },
    ict_smc: { ...LATER_BOOKS.ict_smc },
  };
}

module.exports = {
  AMT_ROLES,
  FACET_TO_AMT,
  SMC_TAGS,
  VSA_TAGS,
  NON_ENTRY_NAMES,
  PARKED,
  SWING_BOOKS,
  LATER_BOOKS,
  amtMapForFacets,
  assertAmtIsNotAFacet,
  researchTagsFrom,
  schoolSnapshot,
  isLiquiditySweep,
  isFvg,
  isOrderBlock,
  isBos,
  isEffortVsResult,
  isNoDemand,
};
