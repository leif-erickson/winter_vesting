'use strict';

const { groupBySession, signalsForSymbol } = require('./signals');
const {
  createAccount,
  maybeNewSession,
  allowEntry,
  sizePosition,
  buy,
  sell,
  outcomeFromPnl,
} = require('./paper');
const { rankAndPromote } = require('./rank');

function allSessionDates(barsBySymbol) {
  const dates = new Set();
  for (const bars of Object.values(barsBySymbol)) {
    for (const bar of bars) dates.add(bar.sessionDate);
  }
  return [...dates].sort();
}

function barsForDate(bars, sessionDate) {
  return bars.filter((b) => b.sessionDate === sessionDate);
}

function priorSessions(bars, sessionDate, lookback) {
  const grouped = groupBySession(bars);
  return [...grouped.keys()]
    .filter((d) => d < sessionDate)
    .sort()
    .slice(-lookback)
    .map((d) => grouped.get(d));
}

function checkExit(position, bar, config) {
  if (bar.minuteOfDay >= config.flattenMinute) {
    return { exitPrice: bar.close, outcomeHint: 'session_flat' };
  }
  if (position.stop != null && bar.low <= position.stop) {
    return { exitPrice: position.stop, outcomeHint: 'stop' };
  }
  if (position.target != null && bar.high >= position.target) {
    return { exitPrice: position.target, outcomeHint: 'target' };
  }
  return null;
}

async function closePosition({ store, account, position, bar, hint }) {
  const sold = sell(account, {
    price: bar.close && hint !== 'stop' && hint !== 'target' ? bar.close : (hint === 'stop' ? position.stop : hint === 'target' ? position.target : bar.close),
    shares: position.quantity,
    avgPrice: position.avgPrice,
  });
  const exitPrice = hint === 'stop' ? position.stop : hint === 'target' ? position.target : bar.close;
  const pnl = (exitPrice - position.avgPrice) * position.quantity;
  const closed = await store.closeTrade(position.tradeId, {
    exitTs: bar.ts,
    exitPrice,
    pnl,
    outcome: hint === 'session_flat' ? outcomeFromPnl(pnl) : (hint === 'stop' ? 'loss' : hint === 'target' ? 'win' : outcomeFromPnl(pnl)),
  });
  await store.upsertPosition({ symbol: position.symbol, quantity: 0 });
  return { account: { ...sold.account, equity: sold.account.settledCash + sold.account.unsettledCash }, closed, pnl };
}

async function runReplay({ store, barsClient, config, days = 20, persist = true }) {
  const barsBySymbol = await barsClient.loadBars(config.universe, { days });
  if (persist && store.resetPaper) {
    await store.resetPaper(config.startingCash);
  }
  let account = createAccount(config.startingCash);
  const open = [];
  const allSignals = [];
  const dates = allSessionDates(barsBySymbol);

  for (const sessionDate of dates) {
    account = maybeNewSession(account, sessionDate);

    const dayBars = [];
    for (const symbol of config.universe) {
      const symbolBars = barsBySymbol[symbol] || [];
      dayBars.push(...barsForDate(symbolBars, sessionDate));
    }
    dayBars.sort((a, b) => a.minuteOfDay - b.minuteOfDay || a.symbol.localeCompare(b.symbol));

    const sessionSignals = [];
    for (const symbol of config.universe) {
      const symbolBars = barsBySymbol[symbol] || [];
      const session = barsForDate(symbolBars, sessionDate);
      if (!session.length) continue;
      const prior = priorSessions(symbolBars, sessionDate, config.rvolLookbackSessions);
      const { signals } = signalsForSymbol(session, { priorSessions: prior, config });
      sessionSignals.push(...signals);
      allSignals.push(...signals);
    }
    sessionSignals.sort((a, b) => a.minuteOfDay - b.minuteOfDay);

    const barsByTs = new Map();
    for (const bar of dayBars) {
      const key = `${bar.symbol}:${bar.minuteOfDay}`;
      barsByTs.set(key, bar);
    }

    const minutes = [...new Set(dayBars.map((b) => b.minuteOfDay))].sort((a, b) => a - b);
    for (const minute of minutes) {
      for (const position of [...open]) {
        const bar = barsByTs.get(`${position.symbol}:${minute}`);
        if (!bar) continue;
        const exit = checkExit(position, bar, config);
        if (exit) {
          const closed = await closePosition({
            store,
            account,
            position,
            bar: { ...bar, close: exit.exitPrice },
            hint: exit.outcomeHint,
          });
          account = closed.account;
          const idx = open.indexOf(position);
          if (idx >= 0) open.splice(idx, 1);
        }
      }

      const minuteSignals = sessionSignals.filter((s) => s.minuteOfDay === minute);
      for (const signal of minuteSignals) {
        const gate = allowEntry(account, config, open.length);
        if (!gate.ok) continue;
        const sized = sizePosition({
          settledCash: account.settledCash,
          price: signal.paperPrice,
          startingCash: config.startingCash,
          maxPositionPct: config.maxPositionPct,
        });
        if (sized.shares <= 0) continue;
        const bought = buy(account, { price: signal.paperPrice, shares: sized.shares });
        if (!bought.ok) continue;
        account = {
          ...bought.account,
          equity: bought.account.settledCash + bought.account.unsettledCash + sized.notional,
        };
        const row = await store.insertTrade({
          symbol: signal.symbol,
          ts: signal.ts,
          side: signal.side,
          setupId: signal.setupId,
          features: signal.features,
          reason: signal.reason,
          paperPrice: signal.paperPrice,
          size: sized.shares,
          notional: sized.notional,
          stop: signal.stop,
          target: signal.target,
          status: 'open',
          mode: 'paper',
        });
        open.push({
          symbol: signal.symbol,
          quantity: sized.shares,
          avgPrice: signal.paperPrice,
          stop: signal.stop,
          target: signal.target,
          tradeId: row.id,
          setupId: signal.setupId,
        });
        await store.upsertPosition({
          symbol: signal.symbol,
          quantity: sized.shares,
          avgPrice: signal.paperPrice,
          openedAt: signal.ts,
          setupId: signal.setupId,
        });
      }
    }

    for (const position of [...open]) {
      const last = dayBars.filter((b) => b.symbol === position.symbol).at(-1);
      if (!last) continue;
      const closed = await closePosition({
        store,
        account,
        position,
        bar: last,
        hint: 'session_flat',
      });
      account = closed.account;
      const idx = open.indexOf(position);
      if (idx >= 0) open.splice(idx, 1);
    }
  }

  if (persist) await store.saveAccount(account);
  const trades = await store.listTrades({ limit: 2000 });
  const rankings = await rankAndPromote(store, {
    setups: config.setups,
    gates: config.promotion,
    trades,
  });

  return {
    source: Object.values(barsBySymbol)[0]?.[0]?.synthetic ? 'synthetic' : 'alpaca',
    days: dates.length,
    universe: config.universe,
    signals: allSignals.length,
    trades: trades.length,
    account,
    rankings,
    todaySignals: allSignals.filter((s) => s.sessionDate === dates.at(-1)),
    liveEnabled: false,
  };
}

async function scanLatestSession({ store, barsClient, config, persist = false }) {
  const barsBySymbol = await barsClient.loadBars(config.universe, { days: 20 });
  const dates = allSessionDates(barsBySymbol);
  const sessionDate = dates.at(-1);
  const signals = [];
  const annotatedBySymbol = {};
  if (!sessionDate) {
    return { sessionDate: null, signals: [], source: 'none', liveEnabled: false };
  }
  for (const symbol of config.universe) {
    const symbolBars = barsBySymbol[symbol] || [];
    const session = barsForDate(symbolBars, sessionDate);
    const prior = priorSessions(symbolBars, sessionDate, config.rvolLookbackSessions);
    const { signals: found, annotated } = signalsForSymbol(session, { priorSessions: prior, config });
    signals.push(...found);
    annotatedBySymbol[symbol] = annotated.slice(-3);
  }
  signals.sort((a, b) => a.minuteOfDay - b.minuteOfDay);
  return {
    sessionDate,
    source: Object.values(barsBySymbol)[0]?.[0]?.synthetic ? 'synthetic' : 'alpaca',
    signals,
    sample: annotatedBySymbol,
    liveEnabled: false,
    persist,
    account: store ? await store.getAccount() : null,
  };
}

module.exports = { runReplay, scanLatestSession, allSessionDates };
