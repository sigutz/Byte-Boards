export type MatchListItem = {
  id: string;
  gameType: string;
  status: 'LIVE' | 'PAUSED' | 'COMPLETED';
  createdAt: string;
  endedAt: string | null;
  winner: string | null;
  summary: string | null;
  players: string[];
  shareUrl: string;
  createdBy: string | null;
};

export type DevCardType = 'knight' | 'vp' | 'road_building' | 'year_of_plenty' | 'monopoly';
export type DevCardCounts = Record<DevCardType, number>;

export type Standing = {
  agentId: string;
  name: string;
  score: number;
  position: number | null;
  seat?: number;
  createdBy?: string | null;
  resources?: number;
  wood?: number;
  brick?: number;
  ore?: number;
  wheat?: number;
  sheep?: number;
  roads?: number;
  settlements?: number;
  cities?: number;
  settlementNodes?: number[];
  cityNodes?: number[];
  roadEdges?: string[];
  devCards?: DevCardCounts;
  knightsPlayed?: number;
  hasLargestArmy?: boolean;
  hasLongestRoad?: boolean;
};

export type MatchEvent = {
  id: string;
  turn: number;
  type: 'COMMENTARY' | 'MOVE' | 'RESULT';
  text: string;
  actor: string | null;
  createdAt: string;
};

export type MatchDetail = {
  id: string;
  gameType: string;
  status: 'LIVE' | 'PAUSED' | 'COMPLETED';
  createdAt: string;
  endedAt: string | null;
  winner: string | null;
  summary: string | null;
  shareToken: string;
  robberTile: number;
  createdById: number | null;
  standings: Standing[];
  events: MatchEvent[];
};

export type SharePayload = {
  id: string;
  gameType: string;
  winner: string | null;
  summary: string | null;
  status: 'LIVE' | 'COMPLETED';
};

export type AgentMetric = {
  agentId: string | number;
  name: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  averageScore: number;
};

export type Trait =
  | 'Empathic' | 'Greedy' | 'HardTrader' | 'Aggressive' | 'Expansionist' | 'Defensive'
  | 'SmartBuilder' | 'FastSpender' | 'DevFocused';

export type TraitInfo = {
  name: Trait;
  description: string;
  conflicts: Trait[];
};

export type Agent = {
  id: number;
  name: string;
  description: string | null;
  traits: Trait[];
};

export type User = {
  id: number;
  name: string | null;
  email: string;
  role: 'USER' | 'ADMIN';
  createdAt?: string;
};

// Traditional Catan player colors
export const PLAYER_COLORS = [
  { hex: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { hex: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  { hex: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  { hex: '#a3e635', bg: 'rgba(163,230,53,0.12)' },
] as const;

export const EVENT_STYLES: Record<string, { color: string; label: string }> = {
  MOVE:        { color: '#f59e0b', label: 'MOVE' },
  COMMENTARY:  { color: '#60a5fa', label: 'TALK' },
  RESULT:      { color: '#eab308', label: 'END'  },
};

export const TARGET_SCORE = 8;
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Per-tab in-memory token — not read from localStorage on every call, so
// another tab logging in as a different user cannot corrupt this tab's requests.
let _activeToken: string | null = localStorage.getItem('bb_token');
export function setActiveToken(t: string | null) { _activeToken = t; }

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = _activeToken;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options?.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    let msg = `API error: ${path}`;
    try { const b = await res.json() as { error?: string }; if (b.error) msg = b.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
  return res.json() as Promise<T>;
}
