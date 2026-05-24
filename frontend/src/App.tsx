import { useEffect, useState } from 'react';
import type { AuthUser } from './context/AuthContext';
import type {
  Agent, AgentMetric, MatchDetail, MatchListItem, SharePayload, User,
} from './types';
import { apiFetch, API_BASE } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './Navbar';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Performance from './pages/Performance';
import Users from './pages/Users';
import MatchDetailPage from './pages/MatchDetail';
import Share from './pages/Share';
import Login from './pages/Login';
import Register from './pages/Register';
import Landing from './pages/Landing';
import HealthCheck from './pages/HealthCheck';

type Invitations = Record<string, string>; // matchId → invitedBy name

function invKey(userId: number) { return `bb_invitations_${userId}`; }
function createdKey(userId: number) { return `bb_created_${userId}`; }

function loadInvitations(userId: number): Invitations {
  try { return JSON.parse(localStorage.getItem(invKey(userId)) ?? '{}') as Invitations; }
  catch { return {}; }
}

function loadCreatedMatches(userId: number): string[] {
  try { return JSON.parse(localStorage.getItem(createdKey(userId)) ?? '[]') as string[]; }
  catch { return []; }
}

function saveInvitation(userId: number, matchId: string, invitedBy: string) {
  const existing = loadInvitations(userId);
  existing[matchId] = invitedBy;
  localStorage.setItem(invKey(userId), JSON.stringify(existing));
}

function saveCreatedMatch(userId: number, matchId: string) {
  const existing = loadCreatedMatches(userId);
  if (!existing.includes(matchId)) {
    localStorage.setItem(createdKey(userId), JSON.stringify([...existing, matchId]));
  }
}

// ── Authenticated experience ─────────────────────────────────────────────────
// Receives a stable `key={user.id}` from AppInner so React fully remounts this
// component (resetting all state) whenever the logged-in account changes.

interface AuthenticatedAppProps {
  user: AuthUser;
  isAdmin: boolean;
  navigate: (path: string) => void;
  route: string;
}

function AuthenticatedApp({ user, isAdmin, navigate, route }: AuthenticatedAppProps) {
  const [gameTypes, setGameTypes]             = useState<string[]>([]);
  const [selectedType, setSelectedType]       = useState('all');
  const [matches, setMatches]                 = useState<MatchListItem[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch]     = useState<MatchDetail | null>(null);
  const [metrics, setMetrics]                 = useState<AgentMetric[]>([]);
  const [agents, setAgents]                   = useState<Agent[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const [users, setUsers]                     = useState<User[]>([]);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [error, setError]                     = useState('');
  const [linkCopied, setLinkCopied]           = useState(false);
  const [invitations, setInvitations]         = useState<Invitations>(() => loadInvitations(user.id));

  // ── Routing helpers ────────────────────────────────────────────────────────
  const url               = new URL(window.location.href);
  const parts             = url.pathname.split('/').filter(Boolean);
  const shareToken        = url.searchParams.get('share');
  const invitedByRaw      = url.searchParams.get('from') ?? '';
  const invitedBy         = invitedByRaw ? decodeURIComponent(invitedByRaw) : '';
  const isHistoryPage     = url.pathname === '/history';
  const isPerformancePage = url.pathname === '/performance';
  const isUsersPage       = url.pathname === '/users';
  const isMatchDetailPage = url.pathname.startsWith('/matches/');
  const isSharePage       = isMatchDetailPage && !!shareToken;
  const matchIdFromPath   = isMatchDetailPage && parts.length >= 2 ? parts[1] : null;

  // ── Data fetching ──────────────────────────────────────────────────────────
  function metricsUrl() {
    const ids = [
      ...Object.keys(loadInvitations(user.id)),
      ...loadCreatedMatches(user.id),
    ];
    const unique = [...new Set(ids)];
    return unique.length > 0 ? `/api/agents/metrics?shareIds=${unique.join(',')}` : '/api/agents/metrics';
  }

  async function loadBase() {
    try {
      const [types, metricData, agentList] = await Promise.all([
        apiFetch<string[]>('/api/game-types'),
        apiFetch<AgentMetric[]>(metricsUrl()),
        apiFetch<Agent[]>('/api/agents'),
      ]);
      setGameTypes(types);
      setMetrics(metricData);
      setAgents(agentList);
      setSelectedAgentIds(prev =>
        prev.length === 0 && agentList.length > 0
          ? agentList.slice(0, 4).map(a => a.id)
          : prev
      );
    } catch {
      setError('Backend unavailable.');
    }
  }

  async function loadMatches() {
    const params = new URLSearchParams();
    if (selectedType !== 'all') params.set('gameType', selectedType);
    const localIds = [
      ...Object.keys(loadInvitations(user.id)),
      ...loadCreatedMatches(user.id),
    ];
    if (localIds.length > 0) params.set('shareIds', [...new Set(localIds)].join(','));
    const q = params.toString() ? `?${params.toString()}` : '';
    try {
      const data = await apiFetch<MatchListItem[]>(`/api/matches${q}`);
      setMatches(data);
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
    if (!isAdmin) return;
    try { setUsers(await apiFetch<User[]>('/api/users')); }
    catch { setError('Could not load users.'); }
  }

  async function deleteUser(id: number) {
    try { await apiFetch(`/api/users/${id}`, { method: 'DELETE' }); await loadUsers(); }
    catch { setError('Could not delete user.'); }
  }

  async function deleteMatch(id: string) {
    try {
      await apiFetch(`/api/matches/${id}`, { method: 'DELETE' });
      await loadMatches();
      if (selectedMatchId === id) setSelectedMatchId(null);
    } catch { setError('Could not delete match.'); }
  }

  async function deleteAgent(id: number) {
    try {
      await apiFetch(`/api/agents/${id}`, { method: 'DELETE' });
      await loadBase();
    } catch { setError('Could not delete agent.'); }
  }

  async function startMatch() {
    setIsCreatingMatch(true);
    setError('');
    try {
      const gameType = selectedType === 'all' ? gameTypes[0] : selectedType;
      const payload = await apiFetch<{ id: string }>('/api/matches', {
        method: 'POST',
        body: JSON.stringify({ gameType, agentIds: selectedAgentIds }),
      });
      saveCreatedMatch(user.id, payload.id);
      setSelectedMatchId(payload.id);
      await loadMatches();
      await loadSelectedMatch(payload.id);
    } catch { setError('Could not start match.'); }
    finally { setIsCreatingMatch(false); }
  }

  async function pauseResumeMatch(matchId: string, action: 'pause' | 'resume') {
    try {
      await apiFetch(`/api/matches/${matchId}/${action}`, { method: 'POST' });
      await loadMatches();
      await loadSelectedMatch(matchId);
    } catch { setError(`Could not ${action} match.`); }
  }

  async function copyShareLink() {
    if (!selectedMatch) return;
    const senderName = encodeURIComponent(user.name ?? user.email);
    const link = `${window.location.origin}/matches/${selectedMatch.id}?share=${selectedMatch.shareToken}&from=${senderName}`;
    try { await navigator.clipboard.writeText(link); }
    catch { window.prompt('Copy this link:', link); }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function toggleAgent(agentId: number) {
    setSelectedAgentIds(cur => {
      if (cur.includes(agentId)) return cur.filter(id => id !== agentId);
      if (cur.length >= 4) return cur;
      return [...cur, agentId];
    });
  }

  async function stopMatch(id: string) {
    try {
      await apiFetch(`/api/matches/${id}/stop`, { method: 'POST' });
      await loadMatches();
      if (selectedMatchId === id) void loadSelectedMatch(id);
    } catch { setError('Could not stop match.'); }
  }

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setError('');
    void loadBase();
    void loadMatches();
    if (isUsersPage) void loadUsers();
  }, [route, selectedType]);

  useEffect(() => {
    const targetId = matchIdFromPath ?? selectedMatchId;
    if (targetId) { setSelectedMatchId(targetId); void loadSelectedMatch(targetId); }
  }, [route, selectedMatchId]);

  useEffect(() => {
    if (isHistoryPage || isPerformancePage || isUsersPage || isMatchDetailPage) return;
    // Only auto-select matches the user created, not ones they were invited to
    const live = matches.find(m => m.status === 'LIVE' && !invitations[m.id]);
    if (live && live.id !== selectedMatchId) setSelectedMatchId(live.id);
  }, [matches, route]);

  // Record invitation when user opens a share link
  useEffect(() => {
    if (isSharePage && matchIdFromPath && invitedBy) {
      saveInvitation(user.id, matchIdFromPath, invitedBy);
      setInvitations(loadInvitations(user.id));
    }
  }, [route]);

  // SSE live updates
  useEffect(() => {
    if (!selectedMatchId) return;
    const stream = new EventSource(`${API_BASE}/api/matches/${selectedMatchId}/stream`);
    stream.onmessage = () => {
      void loadSelectedMatch(selectedMatchId);
      void loadMatches();
      void apiFetch<AgentMetric[]>(metricsUrl()).then(setMetrics).catch(() => undefined);
    };
    stream.onerror = () => stream.close();
    return () => stream.close();
  }, [selectedMatchId]);

  // Polling fallback
  useEffect(() => {
    const t = window.setInterval(() => {
      void loadMatches();
      if (selectedMatchId) void loadSelectedMatch(selectedMatchId);
      void apiFetch<AgentMetric[]>(metricsUrl()).then(setMetrics).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(t);
  }, [selectedMatchId, selectedType]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentPath = url.pathname;

  return (
    <>
      <Navbar currentPath={currentPath} navigate={navigate} />

      {isMatchDetailPage && (
        <MatchDetailPage
          match={selectedMatch}
          navigate={navigate}
          copyShareLink={copyShareLink}
          linkCopied={linkCopied}
          invitedBy={invitedBy || undefined}
          currentUserId={user.id}
          isAdmin={isAdmin}
          onStopMatch={stopMatch}
          onDeleteMatch={(id) => { deleteMatch(id); navigate('/history'); }}
        />
      )}

      {isHistoryPage && (
        <History
          matches={matches}
          navigate={navigate}
          gameTypes={gameTypes}
          selectedType={selectedType}
          onTypeChange={setSelectedType}
          onDeleteMatch={deleteMatch}
          onStopMatch={stopMatch}
          invitations={invitations}
          currentUserName={user.name ?? user.email}
          isAdmin={isAdmin}
        />
      )}

      {isPerformancePage && (
        <Performance metrics={metrics} agents={agents} />
      )}

      {isUsersPage && isAdmin && (
        <Users users={users} onDeleteUser={deleteUser} currentUserId={user.id} />
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
          hasLiveMatch={matches.some(m => (m.status === 'LIVE' || m.status === 'PAUSED') && !invitations[m.id])}
          startMatch={startMatch}
          onPauseResume={pauseResumeMatch}
          selectedMatch={selectedMatch}
          copyShareLink={copyShareLink}
          linkCopied={linkCopied}
          navigate={navigate}
          error={error}
          onAgentCreated={() => void loadBase()}
          isAdmin={isAdmin}
          onDeleteAgent={isAdmin ? deleteAgent : undefined}
        />
      )}
    </>
  );
}

// ── Shell (handles routing + auth gating) ────────────────────────────────────

function AppInner() {
  const { user, isAdmin } = useAuth();
  const [route, setRoute] = useState(window.location.pathname + window.location.search);

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setRoute(path);
  }

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const url               = new URL(window.location.href);
  const parts             = url.pathname.split('/').filter(Boolean);
  const shareToken        = url.searchParams.get('share');
  const invitedByRaw      = url.searchParams.get('from') ?? '';
  const isHealthCheckPage = url.pathname === '/health-check';
  const isLoginPage       = url.pathname === '/login';
  const isRegisterPage    = url.pathname === '/register';
  const isMatchDetailPage = url.pathname.startsWith('/matches/');
  const isSharePage       = isMatchDetailPage && !!shareToken;

  // Share preview data — only needed for unauthenticated visitors
  const [shareData, setShareData]   = useState<SharePayload | null>(null);
  const [shareError, setShareError] = useState('');

  useEffect(() => {
    if (!user && isSharePage && shareToken) {
      setShareData(null);
      setShareError('');
      fetch(`${API_BASE}/api/matches/share/${shareToken}`)
        .then(r => r.ok ? (r.json() as Promise<SharePayload>) : Promise.reject())
        .then(setShareData)
        .catch(() => setShareError('This share link is invalid or the match no longer exists.'));
    }
  }, [route, user]);

  if (isHealthCheckPage) return <HealthCheck navigate={navigate} />;
  if (isLoginPage)    return <Login navigate={navigate} />;
  if (isRegisterPage) return <Register navigate={navigate} />;

  if (!user && isSharePage) {
    return <Share shareData={shareData} error={shareError} navigate={navigate}
                  invitedBy={invitedByRaw ? decodeURIComponent(invitedByRaw) : undefined} />;
  }

  if (!user) {
    if (isMatchDetailPage) {
      const matchId = parts[1];
      sessionStorage.setItem('redirect_after_auth',
        `/matches/${matchId}${shareToken ? `?share=${shareToken}&from=${invitedByRaw}` : ''}`);
    }
    return <Landing navigate={navigate} />;
  }

  // key={user.id} ensures AuthenticatedApp fully remounts on account switch
  return <AuthenticatedApp key={user.id} user={user} isAdmin={isAdmin} navigate={navigate} route={route} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
