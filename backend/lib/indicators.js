'use strict';

function sma(values, period) {
  if (period <= 0) throw new Error('period must be positive');
  const out = Array(values.length).fill(null);
  let running = 0;
  for (let i = 0; i < values.length; i += 1) {
    running += values[i];
    if (i >= period) running -= values[i - period];
    if (i >= period - 1) out[i] = running / period;
  }
  return out;
}

function rsi(values, period = 14) {
  if (period <= 0) throw new Error('period must be positive');
  const n = values.length;
  const out = Array(n).fill(null);
  if (n <= period) return out;

  const gains = [];
  const losses = [];
  for (let i = 1; i < n; i += 1) {
    const change = values[i] - values[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }

  const rsiValue = (avgGain, avgLoss) => {
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  };

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = rsiValue(avgGain, avgLoss);

  for (let i = period + 1; i < n; i += 1) {
    avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    out[i] = rsiValue(avgGain, avgLoss);
  }
  return out;
}

function typicalPrice(bar) {
  return (bar.high + bar.low + bar.close) / 3;
}

function sessionVwap(bars) {
  const out = Array(bars.length).fill(null);
  let cv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const tp = typicalPrice(bars[i]);
    cv += tp * bars[i].volume;
    vol += bars[i].volume;
    out[i] = vol > 0 ? cv / vol : tp;
  }
  return out;
}

function openingRange(bars, orBars = 3) {
  const slice = bars.slice(0, orBars);
  if (!slice.length) return { high: null, low: null, lockedAt: orBars };
  return {
    high: Math.max(...slice.map((b) => b.high)),
    low: Math.min(...slice.map((b) => b.low)),
    lockedAt: orBars,
  };
}

function relativeVolume(volume, priorSameTimeVolumes) {
  if (!priorSameTimeVolumes || priorSameTimeVolumes.length === 0) return 1;
  const avg = priorSameTimeVolumes.reduce((a, b) => a + b, 0) / priorSameTimeVolumes.length;
  if (avg <= 0) return 1;
  return volume / avg;
}

function lastDefined(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] != null) return values[i];
  }
  return null;
}

module.exports = {
  sma,
  rsi,
  typicalPrice,
  sessionVwap,
  openingRange,
  relativeVolume,
  lastDefined,
};
