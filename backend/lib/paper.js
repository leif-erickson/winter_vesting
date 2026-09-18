'use strict';

const {
  DEFAULT_SLEEVE_EQUITY,
  DEFAULT_RISK_PCT,
  MIN_RISK_PCT,
  MAX_RISK_PCT,
  MIN_PLANNED_R,
  MAX_PLANNED_R,
  clampRiskPct,
  plannedR,
  inPlannedRBand,
  ACTIVE_PAPER_SLEEVE,
} = require('./sleeves');

function roundShares(shares) {
  return Math.floor(shares * 1000) / 1000;
}

function stopDistance({ price, stop, side = 'buy' }) {
  const px = Number(price);
  const st = Number(stop);
  if (!(px > 0) || !(st > 0)) return 0;
  const isSell = String(side || 'buy').toUpperCase() === 'SELL';
  const dist = isSell ? (st - px) : (px - st);
  return dist > 0 ? dist : 0;
}

/**
 * Size a paper fill from 1–2% of active sleeve equity (not the $100 RH toy).
 * Prefers setups whose planned R sits in the 1–2 band.
 *
 * Legacy notional-cap fields (startingCash / maxPositionPct) are ignored when
 * sleeveEquity is provided — Alpaca paper is a separate book from RH.
 */
function sizePosition({
  settledCash,
  price,
  stop,
  target,
  side = 'buy',
  sleeveEquity,
  riskPct = DEFAULT_RISK_PCT,
  minRiskPct = MIN_RISK_PCT,
  maxRiskPct = MAX_RISK_PCT,
  minPlannedR = MIN_PLANNED_R,
  maxPlannedR = MAX_PLANNED_R,
  startingCash,
  maxPositionPct,
} = {}) {
  const px = Number(price);
  const cash = Number(settledCash);
  if (!(cash > 0) || !(px > 0)) {
    return { shares: 0, notional: 0, reason: 'invalid_inputs' };
  }

  const equity = Number(sleeveEquity ?? startingCash ?? DEFAULT_SLEEVE_EQUITY);
  if (!(equity > 0)) {
    return { shares: 0, notional: 0, reason: 'invalid_inputs' };
  }

  // Fallback only for callers that still pass the old $100 notional cap API
  // without a stop. Paper fills must supply a stop so risk% is defined.
  if (stop == null && maxPositionPct != null && sleeveEquity == null) {
    const capUsd = Math.min(cash, equity * Number(maxPositionPct));
    if (capUsd < 1) return { shares: 0, notional: 0, reason: 'cap_too_small' };
    const shares = roundShares(capUsd / px);
    const notional = shares * px;
    if (shares <= 0 || notional > cash + 1e-9) {
      return { shares: 0, notional: 0, reason: 'cannot_afford' };
    }
    return { shares, notional, capUsd, reason: 'legacy_notional_cap' };
  }

  const dist = stopDistance({ price: px, stop, side });
  if (!(dist > 0)) {
    return { shares: 0, notional: 0, reason: 'invalid_stop' };
  }

  const r = plannedR({ price: px, stop, target, side });
  if (target != null && !inPlannedRBand(r, { min: minPlannedR, max: maxPlannedR })) {
    return {
      shares: 0,
      notional: 0,
      plannedR: r,
      reason: 'planned_r_outside_band',
    };
  }

  const clampedRisk = clampRiskPct(riskPct, { min: minRiskPct, max: maxRiskPct });
  const riskDollars = equity * clampedRisk;
  let shares = roundShares(riskDollars / dist);
  let notional = shares * px;
  const capUsd = Math.min(cash, equity);
  let capped = false;
  if (notional > capUsd) {
    shares = roundShares(capUsd / px);
    notional = shares * px;
    capped = true;
  }
  if (shares <= 0 || notional > cash + 1e-9) {
    return { shares: 0, notional: 0, reason: 'cannot_afford', plannedR: r };
  }

  let realizedRisk = shares * dist;
  let realizedRiskPct = equity > 0 ? realizedRisk / equity : 0;
  if (realizedRiskPct - 1e-12 > maxRiskPct) {
    shares = roundShares((equity * maxRiskPct) / dist);
    notional = shares * px;
    if (shares <= 0 || notional > cash + 1e-9) {
      return { shares: 0, notional: 0, reason: 'risk_above_band', plannedR: r };
    }
    realizedRisk = shares * dist;
    realizedRiskPct = equity > 0 ? realizedRisk / equity : 0;
  }

  // Tight stops can require >100% of sleeve notional to hit 1% risk. Do not
  // skip those named-edge fills — cap at sleeve cash and keep the journal honest.
  return {
    shares,
    notional,
    capUsd,
    capped,
    riskPct: clampedRisk,
    riskDollars: realizedRisk,
    realizedRiskPct,
    plannedR: r,
    sleeveEquity: equity,
  };
}

function createAccount(startingCash = DEFAULT_SLEEVE_EQUITY, extras = {}) {
  return {
    startingCash,
    cash: startingCash,
    settledCash: startingCash,
    unsettledCash: 0,
    equity: startingCash,
    dayStartEquity: startingCash,
    entriesToday: 0,
    sessionDate: null,
    sleeve: extras.sleeve || ACTIVE_PAPER_SLEEVE,
    settlement: extras.settlement || 'instant',
  };
}

function maybeNewSession(account, sessionDate) {
  if (account.sessionDate === sessionDate) return account;
  const settled = account.settledCash + account.unsettledCash;
  return {
    ...account,
    cash: settled,
    settledCash: settled,
    unsettledCash: 0,
    equity: settled,
    dayStartEquity: settled,
    entriesToday: 0,
    sessionDate,
  };
}

function allowEntry(account, config, openPositionCount) {
  const maxOpen = Number(config.maxOpenPositions);
  if (Number.isFinite(maxOpen) && maxOpen >= 0 && openPositionCount >= maxOpen) {
    return { ok: false, reason: 'max_open_positions' };
  }
  const maxEntries = Number(config.maxEntriesPerDay);
  // 0 / NaN / negative → no 1-trade/day (or N-trade/day) cap.
  if (Number.isFinite(maxEntries) && maxEntries > 0 && account.entriesToday >= maxEntries) {
    return { ok: false, reason: 'max_entries' };
  }
  const loss = account.dayStartEquity - account.equity;
  if (loss >= config.maxDailyLoss) {
    return { ok: false, reason: 'daily_loss_kill_switch' };
  }
  if (account.settledCash < 1) {
    return { ok: false, reason: 'unsettled_cash' };
  }
  return { ok: true };
}

function buy(account, { price, shares }) {
  const notional = shares * price;
  if (notional > account.settledCash + 1e-9) {
    return { account, ok: false, reason: 'insufficient_settled_cash' };
  }
  const settledCash = account.settledCash - notional;
  const cash = settledCash + account.unsettledCash;
  return {
    ok: true,
    account: {
      ...account,
      settledCash,
      cash,
      entriesToday: account.entriesToday + 1,
    },
    notional,
  };
}

function sell(account, { price, shares, avgPrice, settlement }) {
  const proceeds = shares * price;
  const cost = shares * avgPrice;
  const pnl = proceeds - cost;
  const mode = settlement || account.settlement || 'instant';
  // Alpaca paper sleeve: instant reuse so the same symbol may trade again
  // the same session. T+1 is the Robinhood $100 research model, not this book.
  if (mode === 't1') {
    const unsettledCash = account.unsettledCash + proceeds;
    const cash = account.settledCash + unsettledCash;
    return {
      account: {
        ...account,
        unsettledCash,
        cash,
        equity: cash,
      },
      proceeds,
      pnl,
      settledReusable: false,
    };
  }
  const settledCash = account.settledCash + proceeds;
  const cash = settledCash + account.unsettledCash;
  return {
    account: {
      ...account,
      settledCash,
      cash,
      equity: cash,
    },
    proceeds,
    pnl,
    settledReusable: true,
  };
}

function markEquity(account, positions, lastPrices) {
  let mtm = account.settledCash + account.unsettledCash;
  for (const pos of positions) {
    const px = lastPrices[pos.symbol] ?? pos.avgPrice;
    mtm += pos.quantity * px;
  }
  return { ...account, equity: mtm, cash: account.settledCash + account.unsettledCash };
}

function outcomeFromPnl(pnl) {
  if (pnl > 0.01) return 'win';
  if (pnl < -0.01) return 'loss';
  return 'scratch';
}

module.exports = {
  roundShares,
  stopDistance,
  sizePosition,
  createAccount,
  maybeNewSession,
  allowEntry,
  buy,
  sell,
  markEquity,
  outcomeFromPnl,
};
