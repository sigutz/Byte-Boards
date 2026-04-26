import { useEffect, useState } from 'react';
import type {
  Agent, AgentMetric, MatchDetail, MatchListItem,
  SharePayload, User,
} from './types';
import { apiFetch, API_BASE } from './types';
import Navbar from './Navbar';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Performance from './pages/Performance';
import Users from './pages/Users';
import MatchDetailPage from './pages/MatchDetail';
import Share from './pages/Share';

export default function App() {
  const [route, setRoute] = useState(window.location.pathname + window.location.search);

  const [gameTypes, setGameTypes]           = useState<string[]>([]);
  const [selectedType, setSelectedType]     = useState('all');
  const [matches, setMatches]               = useState<MatchListItem[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch]   = useState<MatchDetail | null>(null);
  const [metrics, setMetrics]               = useState<AgentMetric[]>([]);
  const [agents, setAgents]                 = useState<Agent[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const [users, setUsers]                   = useState<User[]>([]);
  const [shareData, setShareData]           = useState<SharePayload | null>(null);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [error, setError]                   = useState('');

  // ── Routing helpers ──────────────────────────────────────────────────────
  const url       = new URL(window.location.href);
  const parts     = url.pathname.split('/').filter(Boolean);
  const shareToken = url.searchParams.get('share');

  const isSharePage       = url.pathname.startsWith('/matches/') && !!shareToken;
  const isHistoryPage     = url.pathname === '/history';
  const isPerformancePage = url.pathname === '/performance';
  const isUsersPage       = url.pathname === '/users';
  const isMatchDetailPage = url.pathname.startsWith('/matches/') && !isSharePage;
  const matchIdFromPath   = isMatchDetailPage && parts.length >= 2 ? parts[1] : null;

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setRoute(path);
  }

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────
  async function loadBase() {
    try {
      const [types, metricData, agentList] = await Promise.all([
        apiFetch<string[]>('/api/game-types'),
        apiFetch<AgentMetric[]>('/api/agents/metrics'),
        apiFetch<Agent[]>('/api/agents'),
      ]);
      setGameTypes(types);
      setMetrics(metricData);
      setAgents(agentList);
      if (selectedAgentIds.length === 0 && agentList.length > 0) {
        setSelectedAgentIds(agentList.slice(0, 4).map(a => a.id));
      }
    } catch {
      setError('Backend unavailable.');
    }
  }

  async function loadMatches() {
    const q = selectedType === 'all' ? '' : `?gameType=${encodeURIComponent(selectedType)}`;
    try {
      const data = await apiFetch<MatchListItem[]>(`/api/matches${q}`);
      setMatches(data);
      if (!selectedMatchId && data.length > 0) setSelectedMatchId(data[0].id);
    } catch {
      setError('Could not load matches.');
    }
  }

  async function loadSelectedMatch(id: string) {
    try {
      const data = await apiFetch<MatchDetail>(`/api/matches/${id}`);
      setSelectedMatch(data);
    } catch {
      setError('Could not load match details.');
    }
  }

  async function loadUsers() {
    try {
      setUsers(await apiFetch<User[]>('/api/users'));
    } catch {
      setError('Could not load users.');
    }
  }

  async function loadShareData() {
    if (!shareToken) { setError('Share link has no token.'); return; }
    try {
      setShareData(await apiFetch<SharePayload>(`/api/matches/share/${shareToken}`));
    } catch {
      setError('Could not load shared match.');
    }
  }

  async function startMatch() {
    setIsCreatingMatch(true);
    setError('');
    try {
      const gameType = selectedType === 'all' ? gameTypes[0] : selectedType;
      const res = await fetch(`${API_BASE}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType, agentIds: selectedAgentIds }),
      });
      if (!res.ok) throw new Error();
      const payload = (await res.json()) as { id: string };
      setSelectedMatchId(payload.id);
      await loadMatches();
      await loadSelectedMatch(payload.id);
      navigate(`/matches/${payload.id}`);
    } catch {
      setError('Could not start match.');
    } finally {
      setIsCreatingMatch(false);
    }
  }

  async function copyShareLink() {
    if (!selectedMatch) return;
    const link = `${window.location.origin}/matches/${selectedMatch.id}?share=${selectedMatch.shareToken}`;
    await navigator.clipboard.writeText(link);
  }

  function toggleAgent(agentId: number) {
    setSelectedAgentIds(cur =>
      cur.includes(agentId) ? cur.filter(id => id !== agentId) : [...cur, agentId]
    );
  }

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setError('');
    if (isSharePage) { void loadShareData(); return; }
    void loadBase();
    void loadMatches();
    if (isUsersPage) void loadUsers();
  }, [route, selectedType]);

  useEffect(() => {
    if (isSharePage) return;
    const targetId = matchIdFromPath ?? selectedMatchId;
    if (targetId) { setSelectedMatchId(targetId); void loadSelectedMatch(targetId); }
  }, [route, selectedMatchId]);

  useEffect(() => {
    if (isSharePage || isHistoryPage || isPerformancePage || isUsersPage || isMatchDetailPage) return;
    const live = matches.find(m => m.status === 'LIVE');
    if (live && live.id !== selectedMatchId) setSelectedMatchId(live.id);
  }, [matches, route]);

  // SSE live updates
  useEffect(() => {
    if (isSharePage || !selectedMatchId) return;
    const stream = new EventSource(`${API_BASE}/api/matches/${selectedMatchId}/stream`);
    stream.onmessage = () => {
      void loadSelectedMatch(selectedMatchId);
      void loadMatches();
      void apiFetch<AgentMetric[]>('/api/agents/metrics').then(setMetrics).catch(() => undefined);
    };
    stream.onerror = () => stream.close();
    return () => stream.close();
  }, [selectedMatchId]);

  // Polling fallback
  useEffect(() => {
    if (isSharePage) return;
    const t = window.setInterval(() => {
      void loadMatches();
      if (selectedMatchId) void loadSelectedMatch(selectedMatchId);
      void apiFetch<AgentMetric[]>('/api/agents/metrics').then(setMetrics).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(t);
  }, [selectedMatchId, selectedType]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (isSharePage) {
    return (
      <>
        <Navbar currentPath={route} navigate={navigate} />
        <Share shareData={shareData} error={error} navigate={navigate} />
      </>
    );
  }

  const currentPath = url.pathname;

  return (
    <>
      <Navbar currentPath={currentPath} navigate={navigate} />

      {isMatchDetailPage && (
        <MatchDetailPage
          match={selectedMatch}
          navigate={navigate}
          copyShareLink={copyShareLink}
        />
      )}

      {isHistoryPage && (
        <History
          matches={matches}
          navigate={navigate}
          gameTypes={gameTypes}
          selectedType={selectedType}
          onTypeChange={setSelectedType}
        />
      )}

      {isPerformancePage && (
        <Performance metrics={metrics} agents={agents} />
      )}

      {isUsersPage && (
        <Users users={users} />
      )}

      {!isMatchDetailPage && !isHistoryPage && !isPerformancePage && !isUsersPage && (
        <Dashboard
          gameTypes={gameTypes}
          selectedType={selectedType}
          onTypeChange={setSelectedType}
          agents={agents}
          metrics={metrics}
          selectedAgentIds={selectedAgentIds}
          toggleAgent={toggleAgent}
          isCreatingMatch={isCreatingMatch}
          startMatch={startMatch}
          selectedMatch={selectedMatch}
          copyShareLink={copyShareLink}
          navigate={navigate}
          error={error}
        />
      )}
    </>
  );
}
