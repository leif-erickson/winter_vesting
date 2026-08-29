'use strict';

const EVENT_KINDS = new Set(['news', 'analysis', 'macro', 'indicator', 'other']);
const IDEA_SOURCES = new Set(['manual', 'ui', 'slack', 'grokbot', 'catalog']);
const IDEA_STATUSES = new Set(['inbox', 'exploring', 'paper', 'rejected', 'parked']);
const EXPLORE_STATUSES = ['exploring', 'paper', 'inbox'];
const EXPLORE_RANK = { exploring: 0, paper: 1, inbox: 2 };
const NEXT_ACTIONS = new Set([
  'specify', 'code', 'run_is', 'run_wf', 'paper_forward', 'iterate', 'kill', 'promote_queue',
]);
const SCHOOL_BOOKS = new Set(['amt', 'brooks', 'tori', 'gann', 'ict_smc', 'orderflow']);
const TRACKS = new Set(['tori_trendline', 'tia_gann_swing']);

const LEDGER_FIELDS = ['school', 'book', 'track', 'timeframe', 'instrumentFamily', 'nextAction', 'sourceUrl'];

function asTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeNextAction(value) {
  const raw = optionalText(value);
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (NEXT_ACTIONS.has(key)) return key;
  return raw;
}

function asSchoolBook(value) {
  const raw = optionalText(value);
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const aliased = (key === 'smc' || key === 'ict') ? 'ict_smc' : key;
  return SCHOOL_BOOKS.has(aliased) ? aliased : null;
}

function asTrack(input = {}) {
  const raw = optionalText(input.track);
  if (raw) {
    const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if (TRACKS.has(key)) return key;
  }
  const book = optionalText(input.book);
  if (book === 'tori_trendlines') return 'tori_trendline';
  if (book === 'gann_swing' || book === 'crypto_gann_swing') return 'tia_gann_swing';
  return null;
}

function normalizeEvent(input = {}) {
  const kind = String(input.kind || 'other').toLowerCase();
  return {
    kind: EVENT_KINDS.has(kind) ? kind : 'other',
    source: String(input.source || 'manual').trim() || 'manual',
    title: String(input.title || '').trim(),
    url: input.url ? String(input.url).trim() : null,
    body: input.body ? String(input.body) : '',
    symbols: asTextArray(input.symbols).map((s) => s.toUpperCase()),
    tags: asTextArray(input.tags),
    publishedAt: input.publishedAt || input.published_at || null,
  };
}

function normalizeIdea(input = {}) {
  const source = String(input.source || 'manual').toLowerCase();
  const status = String(input.status || 'inbox').toLowerCase();
  return {
    title: String(input.title || '').trim(),
    hypothesis: String(input.hypothesis || input.body || '').trim(),
    source: IDEA_SOURCES.has(source) ? source : 'manual',
    slackChannel: input.slackChannel || input.slack_channel || null,
    slackTs: input.slackTs || input.slack_ts || null,
    status: IDEA_STATUSES.has(status) ? status : 'inbox',
    symbols: asTextArray(input.symbols).map((s) => s.toUpperCase()),
    setupId: input.setupId || input.setup_id || null,
    notes: input.notes ? String(input.notes) : '',
    school: optionalText(input.school),
    book: optionalText(input.book),
    track: asTrack(input),
    timeframe: optionalText(input.timeframe),
    instrumentFamily: optionalText(input.instrumentFamily || input.instrument_family),
    nextAction: normalizeNextAction(input.nextAction || input.next_action),
    sourceUrl: optionalText(input.sourceUrl || input.source_url),
  };
}

function toIdeaRow(idea, extras = {}) {
  return {
    title: idea.title,
    hypothesis: idea.hypothesis,
    source: idea.source || 'manual',
    slack_channel: idea.slackChannel || idea.slack_channel || null,
    slack_ts: idea.slackTs || idea.slack_ts || null,
    status: idea.status || 'inbox',
    symbols: idea.symbols || [],
    setup_id: idea.setupId || idea.setup_id || null,
    notes: idea.notes || '',
    school: idea.school || null,
    book: idea.book || null,
    track: asTrack(idea),
    timeframe: idea.timeframe || null,
    instrument_family: idea.instrumentFamily || idea.instrument_family || null,
    next_action: normalizeNextAction(idea.nextAction || idea.next_action),
    source_url: idea.sourceUrl || idea.source_url || null,
    ...extras,
  };
}

function publicIdea(row = {}) {
  const source = row.source || 'manual';
  const exploreRank = row.exploreRank != null
    ? Number(row.exploreRank)
    : (source === 'catalog' ? 99 : 0);
  return {
    id: row.id,
    title: row.title,
    hypothesis: row.hypothesis,
    source,
    slackChannel: row.slackChannel || row.slack_channel || null,
    slackTs: row.slackTs || row.slack_ts || null,
    status: row.status || 'inbox',
    symbols: row.symbols || [],
    setupId: row.setupId || row.setup_id || null,
    notes: row.notes || '',
    school: row.school || null,
    schoolBook: asSchoolBook(row.schoolBook || row.school_book || row.school),
    book: row.book || null,
    track: asTrack(row),
    timeframe: row.timeframe || null,
    instrumentFamily: row.instrumentFamily || row.instrument_family || null,
    nextAction: normalizeNextAction(row.nextAction || row.next_action),
    sourceUrl: row.sourceUrl || row.source_url || null,
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
    exploreRank,
    liveEligible: false,
  };
}

function ideaLedgerPatch(patch = {}) {
  const out = {};
  if (patch.status) out.status = String(patch.status).toLowerCase();
  if (patch.notes != null) out.notes = patch.notes;
  if (patch.setupId || patch.setup_id) out.setup_id = patch.setupId || patch.setup_id;
  if (patch.school !== undefined) out.school = optionalText(patch.school);
  if (patch.book !== undefined) out.book = optionalText(patch.book);
  if (patch.track !== undefined) out.track = asTrack(patch);
  if (patch.timeframe !== undefined) out.timeframe = optionalText(patch.timeframe);
  if (patch.instrumentFamily !== undefined || patch.instrument_family !== undefined) {
    out.instrument_family = optionalText(patch.instrumentFamily || patch.instrument_family);
  }
  if (patch.nextAction !== undefined || patch.next_action !== undefined) {
    out.next_action = normalizeNextAction(patch.nextAction || patch.next_action);
  }
  if (patch.sourceUrl !== undefined || patch.source_url !== undefined) {
    out.source_url = optionalText(patch.sourceUrl || patch.source_url);
  }
  return out;
}

/**
 * exploring / paper first, then inbox. Never promotes live-eligible.
 */
function rankNextToExplore(ideas) {
  return (ideas || [])
    .map((row) => publicIdea(row))
    .filter((idea) => EXPLORE_STATUSES.includes(idea.status))
    .map((idea) => ({ ...idea, liveEligible: false }))
    .sort((a, b) => {
      const statusA = EXPLORE_RANK[a.status] ?? 9;
      const statusB = EXPLORE_RANK[b.status] ?? 9;
      if (statusA !== statusB) return statusA - statusB;
      if (a.exploreRank !== b.exploreRank) return a.exploreRank - b.exploreRank;
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });
}

function flattenBars(barsBySymbol, { timeframe = '5m' } = {}) {
  const out = [];
  for (const [symbol, bars] of Object.entries(barsBySymbol || {})) {
    for (const bar of bars || []) {
      out.push({
        symbol: bar.symbol || symbol,
        timeframe: bar.timeframe || timeframe,
        ts: bar.ts,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0,
        sessionDate: bar.sessionDate || null,
        minuteOfDay: bar.minuteOfDay ?? null,
        source: bar.synthetic ? 'synthetic' : (bar.source || 'alpaca'),
      });
    }
  }
  return out;
}

module.exports = {
  EVENT_KINDS,
  IDEA_SOURCES,
  IDEA_STATUSES,
  EXPLORE_STATUSES,
  NEXT_ACTIONS,
  SCHOOL_BOOKS,
  TRACKS,
  LEDGER_FIELDS,
  asTextArray,
  normalizeEvent,
  normalizeIdea,
  normalizeNextAction,
  asSchoolBook,
  asTrack,
  toIdeaRow,
  publicIdea,
  ideaLedgerPatch,
  rankNextToExplore,
  flattenBars,
};
