import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `$${Number(value).toFixed(2)}`;
}

function pct(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}%`;
}

function signedMoney(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}$${n.toFixed(digits)}`;
}

function ResearchDesk({ api }) {
  const [goals, setGoals] = useState(null);
  const [events, setEvents] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [nextToExplore, setNextToExplore] = useState([]);
  const [honesty, setHonesty] = useState(null);
  const [candles, setCandles] = useState({ bars: 0, symbols: [] });
  const [edge, setEdge] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [eventForm, setEventForm] = useState({
    kind: 'macro', source: 'lynalden.com', title: '', url: '', body: '', symbols: '',
  });
  const [ideaForm, setIdeaForm] = useState({
    title: '', hypothesis: '', source: 'ui', symbols: '',
  });

  const refresh = useCallback(async () => {
    try {
      const [g, e, i, c, edgeRes, boardRes] = await Promise.all([
        axios.get(`${api}/research/goals`),
        axios.get(`${api}/research/events?limit=20`),
        axios.get(`${api}/research/ideas?limit=20`),
        axios.get(`${api}/research/candles/stats`),
        axios.get(`${api}/research/edge`),
        axios.get(`${api}/research/board`),
      ]);
      setGoals(g.data);
      setEvents(e.data.events || []);
      setIdeas(i.data.ideas || []);
      setNextToExplore(boardRes.data.nextToExplore || i.data.nextToExplore || []);
      setHonesty(boardRes.data.honesty || edgeRes.data.honesty || null);
      setCandles(c.data);
      setEdge(edgeRes.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [api]);

  useEffect(() => { refresh(); }, [refresh]);

  const addEvent = async () => {
    setBusy(true);
    try {
      await axios.post(`${api}/research/events`, {
        ...eventForm,
        symbols: eventForm.symbols,
      });
      setEventForm({ ...eventForm, title: '', url: '', body: '', symbols: '' });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  const addIdea = async () => {
    setBusy(true);
    try {
      await axios.post(`${api}/research/ideas`, ideaForm);
      setIdeaForm({ title: '', hypothesis: '', source: 'ui', symbols: '' });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  const setIdeaStatus = async (id, status) => {
    await axios.patch(`${api}/research/ideas/${id}`, { status });
    await refresh();
  };

  const ingestCandles = async () => {
    setBusy(true);
    try {
      await axios.post(`${api}/research/candles/ingest`, { days: 20 });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      {error ? <p className="error">{error}</p> : null}
      <section className="banner">
        <strong>Named edge.</strong> {edge?.namedEdge || 'Stock auction: opening range + VWAP + rvol; flatten by close.'}
        <div className="hint">
          Max {edge?.maxFacets ?? 5} facets.
          AMT labels on the named edge: initial_balance (OR) · value (VWAP) · participation (rvol).
          SMC/VSA are journal tags only; orderflow parked; Gann/Tori are swing books, not 5m facets.
          Frozen holdouts: {(edge?.frozenWindows || []).map((w) => `${w.start}–${w.end} (${w.regime})`).join('; ') || 'Oct–Nov 2025'}.
          Frozen 2025 windows are outside the Aug 2026 paper sample — anomaly share is not scored here.
          Only orb_breakout has an OOS path so far — fewer than 8 OOS trades is unmeasured, not most profitable.
          Journal fills are unmeasured, not OOS. Do not invent a ranking.
          One experiment slot from ideas below — do not add facets because last week was green.
        </div>
      </section>

      <div className="cards">
        <article>
          <h3>Capital goal (not a gate)</h3>
          <p>Start {money(goals?.startingCash)} → target {money(goals?.targetEquity)}</p>
          <p>Horizon {goals?.doubleDays ?? '—'} days · required {pct(goals?.requiredDailyReturnPct)}</p>
          <p>OOS implied days-to-double {goals?.oosDaysToDouble == null ? '—' : Math.round(goals.oosDaysToDouble)}</p>
          <p className="hint">{goals?.warning}</p>
        </article>
        <article>
          <h3>Candle archive</h3>
          <p>{candles.bars} bars · {(candles.symbols || []).join(', ') || 'no symbols yet'}</p>
          <p className="hint">Persist 5m Alpaca (or synthetic) bars, then review techniques in the journal.</p>
          <button onClick={ingestCandles} disabled={busy}>{busy ? 'Working…' : 'Ingest latest bars'}</button>
        </article>
      </div>

      <section>
        <h2>Honesty (OOS vs journal)</h2>
        <p className="hint">
          Verified {honesty?.sample?.window?.start || '2026-08-10'} → {honesty?.sample?.window?.end || '2026-08-28'} paper replay (leif API).
          Live off. {honesty?.note || 'Journal is unmeasured, not most-profitable. Do not invent a ranking.'}
        </p>
        <div className="cards">
          <article>
            <h3>Account</h3>
            <p>
              Start {money(honesty?.sample?.account?.startingCash ?? 100)}
              {' · '}equity ${honesty?.sample?.account?.equity ?? '—'}
              {' · '}realized {signedMoney(honesty?.sample?.account?.realizedPnl, 4)}
            </p>
            <p>{honesty?.sample?.account?.closedTrades ?? 21} closed paper trades · regime {honesty?.sample?.regime?.featuresRegime || 'quiet'}</p>
            <p className="hint">{honesty?.sample?.candles?.bars ?? 9332} 5m bars on {(honesty?.sample?.candles?.universe || []).join(' ') || 'AMZN ARKK BRK.B MSFT NVDA PLTR SOFI TSLA'}.</p>
            <p className="hint">{honesty?.gaps?.qqq?.note || 'QQQ is in HIGH_BETA but not in the candle universe. Gap only — not added this pass.'}</p>
          </article>
          <article>
            <h3>OOS (GET /trading/setups)</h3>
            <p>
              {honesty?.oos?.onlySetupWithOosPath || 'orb_breakout'} n={honesty?.oos?.orbBreakout?.n ?? 2}
              {' · '}WR {honesty?.oos?.orbBreakout?.winRate != null ? `${honesty.oos.orbBreakout.winRate * 100}%` : '50%'}
              {' · '}gross {signedMoney(honesty?.oos?.orbBreakout?.grossPnl ?? 0.637, 3)}
            </p>
            <p className="hint">
              Need {honesty?.oos?.need ?? 8} OOS trades. Status {honesty?.oos?.orbBreakout?.label || 'unmeasured'}.
              All six setups {honesty?.oos?.allSetupsStatus || 'paper'}, live_eligible false.
              Pooled across symbols — not a setup×symbol matrix.
              {honesty?.rankingsEndpoint?.endpoint || 'GET /trading/rankings'} is {honesty?.rankingsEndpoint?.status ?? 404}.
            </p>
            <ul>
              {(honesty?.oos?.orbBreakout?.legs || []).map((leg) => (
                <li key={`${leg.symbol}-${leg.sessionDate}`}>{leg.symbol} {leg.sessionDate} {signedMoney(leg.pnl, 3)}</li>
              ))}
            </ul>
          </article>
        </div>
        <h3>Journal fills (not OOS, unmeasured)</h3>
        <p className="hint">{honesty?.journal?.note || 'Not a ranking. Catalog / universe order, not P&L.'}</p>
        <div className="cards">
          <article>
            <table>
              <thead>
                <tr>
                  <th>Setup</th>
                  <th>n</th>
                  <th>journal P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {(honesty?.journal?.bySetup || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.journalLabel || row.id}{row.note ? ` (${row.note})` : ''}</td>
                    <td>{row.n}</td>
                    <td>{signedMoney(row.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
          <article>
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>n</th>
                  <th>journal P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {(honesty?.journal?.bySymbol || []).map((row) => (
                  <tr key={row.symbol}>
                    <td>{row.symbol}</td>
                    <td>{row.n != null ? row.n : '—'}</td>
                    <td>{signedMoney(row.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </div>
      </section>

      <section>
        <h2>Next to explore</h2>
        <p className="hint">
          Status queue: exploring, then paper, then inbox — not a P&amp;L ranking. This list never marks live-eligible.
        </p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Idea</th>
              <th>Book</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {nextToExplore.map((idea, idx) => (
              <tr key={idea.id || idea.title}>
                <td>{idx + 1}</td>
                <td>
                  <div>{idea.title}</div>
                  <div className="hint">{idea.nextAction || idea.hypothesis}</div>
                </td>
                <td>{idea.book || idea.school || '—'}</td>
                <td><span className="tag paper">{idea.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Strategy ideas</h2>
        <p className="hint">Grokbot can POST /agent/ideas from Slack. Status starts at inbox; exploring / paper / rejected are human calls.</p>
        <div className="actions">
          <input placeholder="Title" value={ideaForm.title} onChange={(e) => setIdeaForm({ ...ideaForm, title: e.target.value })} />
          <input placeholder="Hypothesis" value={ideaForm.hypothesis} onChange={(e) => setIdeaForm({ ...ideaForm, hypothesis: e.target.value })} />
          <input placeholder="Symbols" value={ideaForm.symbols} onChange={(e) => setIdeaForm({ ...ideaForm, symbols: e.target.value })} />
          <button onClick={addIdea} disabled={busy}>Add idea</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Idea</th>
              <th>Source</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ideas.map((idea) => (
              <tr key={idea.id}>
                <td>
                  <div>{idea.title}</div>
                  <div className="hint">{idea.hypothesis}</div>
                </td>
                <td>{idea.source}{(idea.symbols || []).length ? ` · ${(idea.symbols || []).join(', ')}` : ''}</td>
                <td><span className="tag paper">{idea.status}</span></td>
                <td>
                  <button onClick={() => setIdeaStatus(idea.id, 'exploring')}>explore</button>{' '}
                  <button onClick={() => setIdeaStatus(idea.id, 'paper')}>paper</button>{' '}
                  <button onClick={() => setIdeaStatus(idea.id, 'rejected')}>reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Events (news, analysis, macro, indicators)</h2>
        <p className="hint">Store a URL plus a short note. Example source: lynalden.com for fiscal/liquidity regime. Do not dump paywalled full text.</p>
        <div className="actions">
          <select value={eventForm.kind} onChange={(e) => setEventForm({ ...eventForm, kind: e.target.value })}>
            <option value="news">news</option>
            <option value="analysis">analysis</option>
            <option value="macro">macro</option>
            <option value="indicator">indicator</option>
            <option value="other">other</option>
          </select>
          <input placeholder="Source" value={eventForm.source} onChange={(e) => setEventForm({ ...eventForm, source: e.target.value })} />
          <input placeholder="Title" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} />
          <input placeholder="URL" value={eventForm.url} onChange={(e) => setEventForm({ ...eventForm, url: e.target.value })} />
          <input placeholder="Symbols" value={eventForm.symbols} onChange={(e) => setEventForm({ ...eventForm, symbols: e.target.value })} />
          <input placeholder="Note" value={eventForm.body} onChange={(e) => setEventForm({ ...eventForm, body: e.target.value })} />
          <button onClick={addEvent} disabled={busy}>Add event</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Title</th>
              <th>Source</th>
              <th>Symbols</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id}>
                <td>{ev.kind}</td>
                <td>
                  <div>{ev.url ? <a href={ev.url} target="_blank" rel="noreferrer">{ev.title}</a> : ev.title}</div>
                  {ev.body ? <div className="hint">{ev.body}</div> : null}
                </td>
                <td>{ev.source}</td>
                <td>{(ev.symbols || []).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default ResearchDesk;
