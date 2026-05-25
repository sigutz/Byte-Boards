import { useEffect, useState } from 'react';
import type { MatchListItem } from '../types';
import { apiFetch } from '../types';

const STATUS_COLORS: Record<string, string> = {
  LIVE:      '#22c55e',
  PAUSED:    '#f59e0b',
  COMPLETED: '#64748b',
};

const VIS_LABELS: Record<string, string> = {
  PUBLIC:    'Public',
  PROTECTED: 'Invited',
};

interface Props {
  navigate: (path: string) => void;
}

export default function Discover({ navigate }: Props) {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch<MatchListItem[]>('/api/matches/discover')
      .then(data => { setMatches(data); setLoading(false); })
      .catch(() => { setError('Could not load matches.'); setLoading(false); });
  }, []);

  const publicMatches  = matches.filter(m => m.visibility === 'PUBLIC');
  const invitedMatches = matches.filter(m => m.isInvited);

  function MatchCard({ match }: { match: MatchListItem }) {
    const statusColor = STATUS_COLORS[match.status] ?? '#64748b';
    const visLabel    = VIS_LABELS[match.visibility] ?? match.visibility;

    return (
      <div
        onClick={() => navigate(`/matches/${match.id}`)}
        style={{
          background: '#0d1827', border: '1px solid #1a2e47', borderRadius: 10,
          padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#d97706')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = '#1a2e47')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: statusColor, boxShadow: match.status === 'LIVE' ? `0 0 6px ${statusColor}` : 'none',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {match.name ?? match.players.join(' vs ')}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 6px',
            borderRadius: 4, background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.25)',
            color: '#d97706', textTransform: 'uppercase',
          }}>
            {visLabel}
          </span>
        </div>

        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
          {match.players.join(' · ')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: '#475569' }}>
            {match.gameType === 'catan-seafarers' ? 'Seafarers' : 'Classic'} · {match.status}
          </span>
          {match.winner && (
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
              {match.winner} won
            </span>
          )}
        </div>

        {match.summary && (
          <p style={{
            margin: '8px 0 0', fontSize: 11, color: '#475569',
            borderTop: '1px solid #1a2e47', paddingTop: 8, lineHeight: 1.5,
          }}>
            {match.summary.length > 120 ? match.summary.slice(0, 120) + '…' : match.summary}
          </p>
        )}
      </div>
    );
  }

  function Section({ title, items }: { title: string; items: MatchListItem[] }) {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', marginBottom: 12, textTransform: 'uppercase' }}>
          {title}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {items.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>Discover</h1>
      <p style={{ fontSize: 13, color: '#475569', marginBottom: 28 }}>
        Browse public matches and matches you've been invited to watch.
      </p>

      {loading && <p style={{ color: '#475569' }}>Loading…</p>}
      {error  && <p style={{ color: '#f87171' }}>{error}</p>}

      {!loading && !error && matches.length === 0 && (
        <p style={{ color: '#475569', fontSize: 14 }}>No matches to show yet. Ask someone to share a match with you, or start a public one!</p>
      )}

      <Section title="Public Matches" items={publicMatches} />
      <Section title="Invited to Watch" items={invitedMatches} />
    </div>
  );
}
