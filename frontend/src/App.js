import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import PortfolioItem from './components/PortfolioItem';
import './App.css';

const API = 'http://localhost:5000';

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `$${Number(value).toFixed(2)}`;
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(0)}%`;
}

function App() {
  const [tab, setTab] = useState('trading');
  return (
    <div className="app">
      <header className="app-header">
        <h1>Paper Day Trading</h1>
        <p className="sub">US equities · $100 cash model · live Robinhood is out of band and hard-off</p>
        <nav>
          <button className={tab === 'trading' ? 'active' : ''} onClick={() => setTab('trading')}>Day trading</button>
          <button className={tab === 'portfolio' ? 'active' : ''} onClick={() => setTab('portfolio')}>Portfolio</button>
        </nav>
      </header>
      {tab === 'trading' ? <TradingDashboard /> : <PortfolioTracker />}
    </div>
  );
}

function TradingDashboard() {
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [setups, setSetups] = useState([]);
  const [journal, setJournal] = useState([]);
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [liveEnabled, setLiveEnabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [acct, stp, jnl, pnl] = await Promise.all([
        axios.get(`${API}/trading/account`),
        axios.get(`${API}/trading/setups`),
        axios.get(`${API}/trading/journal?limit=25`),
        axios.get(`${API}/trading/pnl`),
      ]);
      setAccount({ ...acct.data.account, ...pnl.data });
      setPositions(acct.data.positions || []);
      setSetups(stp.data.setups || []);
      setJournal(jnl.data.trades || []);
      setLiveEnabled(Boolean(acct.data.liveEnabled || stp.data.liveEnabled));
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runReplay = async () => {
    setBusy(true);
    try {
      await axios.post(`${API}/trading/replay`, { days: 20 });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  const runScan = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/trading/scan`);
      setScan(data);
      setLiveEnabled(Boolean(data.liveEnabled));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <section className="banner">
        Live execution: <strong>{liveEnabled ? 'ON' : 'OFF'}</strong>
        {' '}· Robinhood adapter is a stub. Grok Bot calls Robinhood MCP (review then place) only after you confirm a specific order.
      </section>
      {error ? <p className="error">{error}</p> : null}

      <div className="actions">
        <button onClick={runReplay} disabled={busy}>{busy ? 'Running…' : 'Replay paper (20d)'}</button>
        <button onClick={runScan} disabled={busy}>Scan latest session</button>
        <button onClick={refresh} disabled={busy}>Refresh</button>
      </div>

      <section className="cards">
        <article>
          <h3>Paper account</h3>
          <p>Equity {money(account?.equity)}</p>
          <p>Settled cash {money(account?.settled_cash ?? account?.settledCash)}</p>
          <p>Unsettled {money(account?.unsettled_cash ?? account?.unsettledCash)}</p>
          <p>Realized P&amp;L {money(account?.realizedPnl)}</p>
          <p className="hint">Sold proceeds settle T+1 and are not reusable the same session. Max 25% of the $100 in one name. No options.</p>
        </article>
        <article>
          <h3>Open paper positions</h3>
          {positions.length === 0 ? <p>Flat</p> : positions.map((p) => (
            <p key={p.symbol}>{p.symbol} × {Number(p.quantity).toFixed(3)} @ {money(p.avg_price)}</p>
          ))}
        </article>
      </section>

      <section>
        <h2>Setups</h2>
        <table>
          <thead>
            <tr>
              <th>Setup</th>
              <th>Status</th>
              <th>OOS trades</th>
              <th>Win rate</th>
              <th>OOS P&amp;L</th>
              <th>Consistency</th>
            </tr>
          </thead>
          <tbody>
            {setups.map((s) => {
              const m = s.metrics || {};
              return (
                <tr key={s.id}>
                  <td>
                    <div>{s.name}</div>
                    <div className="hint">{s.description}</div>
                  </td>
                  <td>
                    <span className={s.live_eligible ? 'tag live' : 'tag paper'}>
                      {s.live_eligible ? 'live-eligible' : (s.status || 'paper')}
                    </span>
                  </td>
                  <td>{m.trades ?? '—'}</td>
                  <td>{m.winRate != null ? pct(m.winRate) : '—'}</td>
                  <td>{m.grossPnl != null ? money(m.grossPnl) : '—'}</td>
                  <td>{m.consistency != null ? pct(m.consistency) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Today’s signals</h2>
        {!scan ? <p className="hint">Run a scan to annotate the latest 5-minute RTH session (Alpaca if keyed, otherwise synthetic).</p> : null}
        {scan && !scan.signals?.length ? <p>No signals on {scan.sessionDate} ({scan.source}).</p> : null}
        {scan?.signals?.map((s, i) => (
          <div className="signal" key={`${s.symbol}-${s.setupId}-${i}`}>
            <strong>{s.symbol}</strong> {s.setupId} {s.side} @ {money(s.paperPrice)}
            <div className="why">Why: {s.reason}</div>
          </div>
        ))}
      </section>

      <section>
        <h2>Journal</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Symbol</th>
              <th>Setup</th>
              <th>Side</th>
              <th>Price</th>
              <th>Size</th>
              <th>P&amp;L</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {journal.map((t) => (
              <tr key={t.id}>
                <td>{String(t.ts).replace('T', ' ').slice(0, 19)}</td>
                <td>{t.symbol}</td>
                <td>{t.setup_id}</td>
                <td>{t.side}</td>
                <td>{money(t.paper_price)}</td>
                <td>{Number(t.size).toFixed(3)}</td>
                <td>{t.pnl == null ? t.status : money(t.pnl)}</td>
                <td className="why">{t.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function PortfolioTracker() {
  const [portfolio, setPortfolio] = useState([]);
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState('stock');
  const [quantity, setQuantity] = useState(0);
  const [originalCost, setOriginalCost] = useState(0);

  useEffect(() => { fetchPortfolio(); }, []);

  const fetchPortfolio = async () => {
    const response = await axios.get(`${API}/portfolio`);
    setPortfolio(response.data);
  };

  const addItem = async () => {
    await axios.post(`${API}/portfolio`, {
      symbol,
      type,
      quantity: parseFloat(quantity),
      original_cost: parseFloat(originalCost),
    });
    fetchPortfolio();
    setSymbol('');
    setQuantity(0);
    setOriginalCost(0);
  };

  const removeItem = async (id) => {
    await axios.delete(`${API}/portfolio/${id}`);
    fetchPortfolio();
  };

  return (
    <main>
      <h2>Holdings</h2>
      <div className="actions">
        <input placeholder="Symbol (e.g., AAPL or BTC)" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="stock">Stock</option>
          <option value="crypto">Crypto</option>
        </select>
        <input type="number" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <input type="number" placeholder="Original Cost per Unit" value={originalCost} onChange={(e) => setOriginalCost(e.target.value)} />
        <button onClick={addItem}>Add</button>
      </div>
      <ul>
        {portfolio.map((item) => (
          <PortfolioItem key={item.id} item={item} onRemove={removeItem} />
        ))}
      </ul>
    </main>
  );
}

export default App;
