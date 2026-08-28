'use strict';

function roundShares(shares) {
  return Math.floor(shares * 1000) / 1000;
}

function sizePosition({
  settledCash,
  price,
  startingCash = 100,
  maxPositionPct = 0.25,
}) {
  if (!(settledCash > 0) || !(price > 0)) {
    return { shares: 0, notional: 0, reason: 'invalid_inputs' };
  }
  const capUsd = Math.min(settledCash, startingCash * maxPositionPct);
  if (capUsd < 1) {
    return { shares: 0, notional: 0, reason: 'cap_too_small' };
  }
  const shares = roundShares(capUsd / price);
  const notional = shares * price;
  if (shares <= 0 || notional > settledCash + 1e-9) {
    return { shares: 0, notional: 0, reason: 'cannot_afford' };
  }
  return { shares, notional, capUsd };
}

function createAccount(startingCash = 100) {
  return {
    startingCash,
    cash: startingCash,
    settledCash: startingCash,
    unsettledCash: 0,
    equity: startingCash,
    dayStartEquity: startingCash,
    entriesToday: 0,
    sessionDate: null,
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
  if (openPositionCount >= config.maxOpenPositions) {
    return { ok: false, reason: 'max_open_positions' };
  }
  if (account.entriesToday >= config.maxEntriesPerDay) {
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

function sell(account, { price, shares, avgPrice }) {
  const proceeds = shares * price;
  const cost = shares * avgPrice;
  const pnl = proceeds - cost;
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
    // Sold proceeds are not instantly reusable (T+1 cash settlement).
    settledReusable: false,
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
  sizePosition,
  createAccount,
  maybeNewSession,
  allowEntry,
  buy,
  sell,
  markEquity,
  outcomeFromPnl,
};
