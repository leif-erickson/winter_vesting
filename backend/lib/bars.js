'use strict';

const { DateTimeFormat } = Intl;

function pad(n) {
  return String(n).padStart(2, '0');
}

function etParts(date) {
  const fmt = new DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function sessionDateOf(date) {
  const p = etParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function minuteOfDayOf(date) {
  const p = etParts(date);
  return p.hour * 60 + p.minute;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_PRICES = {
  SOFI: 12.5,
  'BRK.B': 410,
  TSLA: 180,
  AMZN: 185,
  ARKK: 48,
  MSFT: 415,
  NVDA: 120,
  PLTR: 28,
};

function scenarioForDay(dayIndex) {
  const mod = dayIndex % 5;
  if (mod === 0 || mod === 1) return 'breakout';
  if (mod === 2) return 'reversion';
  if (mod === 3) return 'retest';
  return 'chop';
}

function rthMinutes() {
  const out = [];
  for (let m = 9 * 60 + 30; m < 16 * 60; m += 5) out.push(m);
  return out;
}

/**
 * Deterministic synthetic 5-minute RTH bars. Used when Alpaca keys are
 * missing and for tests. Scenarios are biased so at least one method
 * produces signals on historical-style sessions.
 */
function generateSyntheticBars(symbol, { days = 20, seed = 1, startDate = '2024-03-04' } = {}) {
  const rand = mulberry32(seed + symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const minutes = rthMinutes();
  const start = new Date(`${startDate}T14:30:00.000Z`);
  const bars = [];
  let px = BASE_PRICES[symbol] || 25;

  for (let d = 0; d < days; d += 1) {
    const session = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
    const yyyy = session.getUTCFullYear();
    const mm = pad(session.getUTCMonth() + 1);
    const dd = pad(session.getUTCDate());
    const sessionDate = `${yyyy}-${mm}-${dd}`;
    const scenario = scenarioForDay(d);
    const dayMove = (rand() - 0.45) * 0.01;
    let orHigh = px;
    let orLow = px;

    for (let i = 0; i < minutes.length; i += 1) {
      const minuteOfDay = minutes[i];
      let drift = dayMove / minutes.length;
      let volMult = 1;
      if (scenario === 'breakout' && i >= 3 && i < 12) {
        drift += 0.004;
        volMult = 2.2;
      } else if (scenario === 'reversion' && i >= 8 && i < 18) {
        drift -= 0.003;
        volMult = 1.6;
      } else if (scenario === 'reversion' && i >= 18 && i < 28) {
        drift += 0.0045;
        volMult = 1.8;
      } else if (scenario === 'retest' && i >= 3 && i < 8) {
        drift += 0.0035;
        volMult = 2.0;
      } else if (scenario === 'retest' && i >= 10 && i < 16) {
        drift -= 0.002;
        volMult = 1.3;
      } else if (scenario === 'retest' && i >= 16 && i < 24) {
        drift += 0.003;
        volMult = 1.5;
      }

      const noise = (rand() - 0.5) * px * 0.002;
      const open = px;
      px = Math.max(0.5, px * (1 + drift) + noise);
      const high = Math.max(open, px) * (1 + rand() * 0.001);
      const low = Math.min(open, px) * (1 - rand() * 0.001);
      const close = px;
      if (i < 3) {
        orHigh = Math.max(orHigh, high);
        orLow = Math.min(orLow, low);
      }
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      const ts = `${sessionDate}T${pad(hour)}:${pad(minute)}:00-04:00`;
      bars.push({
        symbol,
        ts,
        open,
        high,
        low,
        close,
        volume: Math.round(8000 * volMult * (0.7 + rand())),
        sessionDate,
        minuteOfDay,
        synthetic: true,
      });
    }
  }
  return bars;
}

function generateUniverseBars(symbols, options) {
  const bySymbol = {};
  for (const symbol of symbols) {
    bySymbol[symbol] = generateSyntheticBars(symbol, options);
  }
  return bySymbol;
}

function normalizeAlpacaBar(symbol, bar) {
  const tsDate = new Date(bar.Timestamp || bar.timestamp || bar.t);
  return {
    symbol,
    ts: tsDate.toISOString(),
    open: Number(bar.OpenPrice ?? bar.open ?? bar.o),
    high: Number(bar.HighPrice ?? bar.high ?? bar.h),
    low: Number(bar.LowPrice ?? bar.low ?? bar.l),
    close: Number(bar.ClosePrice ?? bar.close ?? bar.c),
    volume: Number(bar.Volume ?? bar.volume ?? bar.v ?? 0),
    sessionDate: sessionDateOf(tsDate),
    minuteOfDay: minuteOfDayOf(tsDate),
    synthetic: false,
  };
}

function hasAlpacaKeys(env = process.env) {
  return Boolean(env.ALPACA_API_KEY && env.ALPACA_SECRET_KEY
    && env.ALPACA_API_KEY !== 'your_alpaca_key'
    && env.ALPACA_SECRET_KEY !== 'your_alpaca_secret');
}

function createBarsClient({ alpaca, env = process.env } = {}) {
  return {
    async loadBars(symbols, { days = 20 } = {}) {
      if (alpaca && hasAlpacaKeys(env)) {
        try {
          return await loadAlpacaBars(alpaca, symbols, days);
        } catch (err) {
          console.warn(`Alpaca bars failed (${err.message}); using synthetic data`);
        }
      }
      return generateUniverseBars(symbols, { days, seed: 42 });
    },
  };
}

async function loadAlpacaBars(alpaca, symbols, days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const bySymbol = {};
  for (const symbol of symbols) {
    const bars = [];
    const iter = alpaca.getBarsV2(symbol, {
      start: start.toISOString(),
      end: end.toISOString(),
      timeframe: '5Min',
      adjustment: 'raw',
      feed: 'iex',
    });
    for await (const bar of iter) {
      const normalized = normalizeAlpacaBar(symbol, bar);
      if (normalized.minuteOfDay >= 9 * 60 + 30 && normalized.minuteOfDay < 16 * 60) {
        bars.push(normalized);
      }
    }
    bySymbol[symbol] = bars;
  }
  return bySymbol;
}

module.exports = {
  generateSyntheticBars,
  generateUniverseBars,
  createBarsClient,
  hasAlpacaKeys,
  sessionDateOf,
  minuteOfDayOf,
  normalizeAlpacaBar,
  scenarioForDay,
};
