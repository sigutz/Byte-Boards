import { useEffect, useState } from 'react';

type MatchListItem = {
  id: string;
  gameType: string;
  status: 'LIVE' | 'COMPLETED';
  createdAt: string;
  endedAt: string | null;
  winner: string | null;
  summary: string | null;
  players: string[];
  shareUrl: string;
};

type MatchDetail = {
  id: string;
  gameType: string;
  status: 'LIVE' | 'COMPLETED';
  createdAt: string;
  endedAt: string | null;
  winner: string | null;
  summary: string | null;
  shareToken: string;
  standings: Array<{
    agentId: string;
    name: string;
    score: number;
    position: number | null;
  }>;
  events: Array<{
    id: string;
    turn: number;
    type: 'COMMENTARY' | 'MOVE' | 'RESULT';
    text: string;
    actor: string | null;
    createdAt: string;
  }>;
};

type SharePayload = {
  id: string;
  gameType: string;
  winner: string | null;
  summary: string | null;
  status: 'LIVE' | 'COMPLETED';
};

type AgentMetric = {
  agentId: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  averageScore: number;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function splitSummary(summary: string | null): { overview: string; keyMoments: string[] } {
  if (!summary) {
    return {
      overview: 'Aștept rezumatul AI după finalizarea meciului.',
      keyMoments: []
    };
  }

  const marker = 'Key moments:';
  const markerIndex = summary.indexOf(marker);
  if (markerIndex === -1) {
    return { overview: summary, keyMoments: [] };
  }

  const overview = summary.slice(0, markerIndex).trim();
  const keyMomentsRaw = summary.slice(markerIndex + marker.length).trim();
  const keyMoments = keyMomentsRaw
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

  return { overview, keyMoments };
}

export default function App() {
  const [route, setRoute] = useState(window.location.pathname + window.location.search);
  const [shareData, setShareData] = useState<SharePayload | null>(null);

  const [gameTypes, setGameTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState('all');
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);
  const [metrics, setMetrics] = useState<AgentMetric[]>([]);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [error, setError] = useState<string>('');

  const currentUrl = new URL(window.location.href);
  const pathParts = currentUrl.pathname.split('/').filter(Boolean);
  const isSharePage = currentUrl.pathname.startsWith('/matches/') && currentUrl.searchParams.has('share');
  const isHistoryPage = currentUrl.pathname === '/history';
  const isSummariesPage = currentUrl.pathname === '/summaries';
  const isPerformancePage = currentUrl.pathname === '/performance';
  const isMatchDetailPage = currentUrl.pathname.startsWith('/matches/') && !isSharePage;
  const matchIdFromPath = isMatchDetailPage && pathParts.length >= 2 ? pathParts[1] : null;
  const shareToken = currentUrl.searchParams.get('share');

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`);
    if (!response.ok) {
      throw new Error(`Request failed: ${url}`);
    }
    return (await response.json()) as T;
  }

  async function loadBase() {
    try {
      const [types, metricData] = await Promise.all([
        fetchJson<string[]>('/api/game-types'),
        fetchJson<AgentMetric[]>('/api/agents/metrics')
      ]);
      setGameTypes(types);
      setMetrics(metricData);
    } catch {
      setError('Backend indisponibil.');
    }
  }

  async function loadShareData() {
    if (!shareToken) {
      setError('Link-ul de share nu conține token.');
      return;
    }
    try {
      const payload = await fetchJson<SharePayload>(`/api/matches/share/${shareToken}`);
      setShareData(payload);
    } catch {
      setError('Nu am putut încărca rezumatul partajat.');
    }
  }

  async function loadMatches() {
    const query = selectedType === 'all' ? '' : `?gameType=${encodeURIComponent(selectedType)}`;
    try {
      const data = await fetchJson<MatchListItem[]>(`/api/matches${query}`);
      setMatches(data);
      if (!selectedMatchId && data.length > 0) {
        setSelectedMatchId(data[0].id);
      }
    } catch {
      setError('Nu am putut încărca istoricul meciurilor.');
    }
  }

  async function loadSelectedMatch(id: string) {
    try {
      const data = await fetchJson<MatchDetail>(`/api/matches/${id}`);
      setSelectedMatch(data);
    } catch {
      setError('Nu am putut încărca detaliile meciului.');
    }
  }

  async function startMatch() {
    setIsCreatingMatch(true);
    setError('');
    try {
      const gameType = selectedType === 'all' ? gameTypes[0] : selectedType;
      const response = await fetch(`${API_BASE}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType })
      });
      if (!response.ok) {
        throw new Error('Failed to create match');
      }

      const payload = (await response.json()) as { id: string };
      setSelectedMatchId(payload.id);
      await loadMatches();
      await loadSelectedMatch(payload.id);
      navigate(`/matches/${payload.id}`);
    } catch {
      setError('Nu am putut porni un meci nou.');
    } finally {
      setIsCreatingMatch(false);
    }
  }

  async function copyShareLink() {
    if (!selectedMatch) {
      return;
    }
    const link = `${window.location.origin}/matches/${selectedMatch.id}?share=${selectedMatch.shareToken}`;
    await navigator.clipboard.writeText(link);
  }

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setRoute(path);
  }

  useEffect(() => {
    const onPopState = () => {
      setRoute(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    setError('');
    if (isSharePage) {
      void loadShareData();
      return;
    }
    void loadBase();
    void loadMatches();
  }, [route, selectedType]);

  useEffect(() => {
    if (isSharePage) return;
    const targetId = matchIdFromPath ?? selectedMatchId;
    if (targetId) {
      setSelectedMatchId(targetId);
      void loadSelectedMatch(targetId);
    }
  }, [route, selectedMatchId]);

  useEffect(() => {
    if (isSharePage || isHistoryPage || isSummariesPage || isPerformancePage || isMatchDetailPage) return;
    const liveMatch = matches.find((match) => match.status === 'LIVE');
    if (liveMatch && liveMatch.id !== selectedMatchId) {
      setSelectedMatchId(liveMatch.id);
    }
  }, [matches, selectedMatchId, route]);

  useEffect(() => {
    if (isSharePage || !selectedMatchId) return;
    const stream = new EventSource(`${API_BASE}/api/matches/${selectedMatchId}/stream`);
    stream.onmessage = () => {
      void loadSelectedMatch(selectedMatchId);
      void loadMatches();
      void fetchJson<AgentMetric[]>('/api/agents/metrics').then(setMetrics).catch(() => undefined);
    };
    stream.onerror = () => {
      stream.close();
    };
    return () => stream.close();
  }, [selectedMatchId]);

  useEffect(() => {
    if (isSharePage) return;
    const timer = window.setInterval(() => {
      void loadMatches();
      if (selectedMatchId) {
        void loadSelectedMatch(selectedMatchId);
      }
      void fetchJson<AgentMetric[]>('/api/agents/metrics').then(setMetrics).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedMatchId, selectedType]);

  if (isSharePage) {
    return (
      <main className="container">
        <h1>Rezumat meci partajat</h1>
        {error && <p className="error">{error}</p>}
        {!error && !shareData && <p>Se încarcă...</p>}
        {shareData && (
          <section className="card">
            <p>
              <strong>Câștigător:</strong> {shareData.winner ?? 'în curs'}
            </p>
            <div className="button-row centered-buttons">
              <button onClick={() => navigate('/')}>Înapoi la dashboard</button>
            </div>
          </section>
        )}
      </main>
    );
  }

  const completedMatches = matches.filter((match) => match.status === 'COMPLETED');

  return (
    <main className="container">
      <h1>AI Match Observer</h1>
      <p>Urmărești meciuri AI live, vezi rezumate, istoric, detalii și metrici de performanță.</p>
      <nav className="tabs">
        <button className={!isHistoryPage && !isSummariesPage && !isPerformancePage && !isMatchDetailPage ? 'active-tab' : ''} onClick={() => navigate('/')}>
          Dashboard
        </button>
        <button className={isHistoryPage ? 'active-tab' : ''} onClick={() => navigate('/history')}>
          Istoric
        </button>
        <button className={isSummariesPage ? 'active-tab' : ''} onClick={() => navigate('/summaries')}>
          Rezumate
        </button>
        <button className={isPerformancePage ? 'active-tab' : ''} onClick={() => navigate('/performance')}>
          Performanță
        </button>
      </nav>

      {!isHistoryPage && !isSummariesPage && !isPerformancePage && !isMatchDetailPage && (
        <section className="toolbar card">
          <button onClick={() => void startMatch()} disabled={isCreatingMatch}>
            {isCreatingMatch ? 'Pornesc...' : 'Pornește meci nou'}
          </button>
        </section>
      )}

      {(isHistoryPage || isSummariesPage) && (
        <section className="toolbar card">
          <label>
            Tip joc
            <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
              <option value="all">toate</option>
              {gameTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      {!isHistoryPage && !isSummariesPage && !isPerformancePage && !isMatchDetailPage && (
        <section className="card">
          <h2>Meci live</h2>
          {!selectedMatch && <p>Nu există meci live în acest moment. Pornește unul nou.</p>}
          {selectedMatch && (
            <>
              <p>
                <strong>Tip joc:</strong> {selectedMatch.gameType}
              </p>
              <p>
                <strong>Status:</strong> {selectedMatch.status} | <strong>Câștigător:</strong>{' '}
                {selectedMatch.winner ?? 'în curs'}
              </p>
              <div className="button-row centered-buttons">
                <button onClick={() => void copyShareLink()}>Copiază link de share</button>
                <button onClick={() => navigate(`/matches/${selectedMatch.id}`)}>Deschide pagina de detalii</button>
              </div>

              <h3>Statistici live</h3>
              <ul className="list">
                {selectedMatch.standings.map((entry) => (
                  <li key={entry.agentId}>
                    {entry.position ? `#${entry.position}` : '-'} {entry.name} - {entry.score} puncte
                  </li>
                ))}
              </ul>

              <h3>Comentarii live</h3>
              <ul className="list log">
                {selectedMatch.events.slice(-12).map((event) => (
                  <li key={event.id}>
                    <strong>T{event.turn}</strong> [{event.type}] {event.actor ? `${event.actor}: ` : ''}
                    {event.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {isHistoryPage && (
        <section className="card">
          <h2>Istoric meciuri</h2>
          <ul className="list">
            {matches.map((match) => (
              <li key={match.id} onClick={() => navigate(`/matches/${match.id}`)}>
                <strong>{match.gameType}</strong> - {match.status} - {new Date(match.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isSummariesPage && (
        <section className="card">
          <h2>Rezumate meciuri finalizate</h2>
          <ul className="list">
            {completedMatches.map((match) => (
              <li key={match.id} onClick={() => navigate(`/matches/${match.id}`)}>
                <strong>{match.gameType}</strong> - câștigător: {match.winner ?? 'necunoscut'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isPerformancePage && (
        <section className="card">
          <h2>Performanță agenți</h2>
          <ul className="list">
            {metrics.map((metric) => (
              <li key={metric.agentId}>
                <strong>{metric.name}</strong>
                <div>
                  {metric.wins}/{metric.gamesPlayed} victorii ({Math.round(metric.winRate * 100)}%)
                </div>
                <small>Scor mediu: {metric.averageScore}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isMatchDetailPage && (
        <section className="card">
          <h2>Detalii meci</h2>
          {!selectedMatch && <p>Selectează un meci din istoric.</p>}
          {selectedMatch && (
            <>
              {(() => {
                const parsedSummary = splitSummary(selectedMatch.summary);
                return (
                  <>
                    <p>
                      <strong>Status:</strong> {selectedMatch.status} | <strong>Câștigător:</strong>{' '}
                      {selectedMatch.winner ?? 'în curs'}
                    </p>
                    {parsedSummary.keyMoments.length > 0 && (
                      <div className="key-moments-box">
                        <h3>Momente cheie</h3>
                        <ul className="list">
                          {parsedSummary.keyMoments.map((moment, index) => (
                            <li key={`${moment}-${index}`}>{moment}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="button-row centered-buttons">
                <button onClick={() => void copyShareLink()}>Copiază link de share</button>
                <button onClick={() => navigate('/history')}>Înapoi la istoric</button>
              </div>

              <h3>Statistici meci</h3>
              <ul className="list">
                {selectedMatch.standings.map((entry) => (
                  <li key={entry.agentId}>
                    {entry.position ? `#${entry.position}` : '-'} {entry.name}: {entry.score} puncte
                  </li>
                ))}
              </ul>

              <h3>Comentarii live</h3>
              <ul className="list log">
                {selectedMatch.events.slice(-12).map((event) => (
                  <li key={event.id}>
                    <strong>T{event.turn}</strong> [{event.type}] {event.actor ? `${event.actor}: ` : ''}
                    {event.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
