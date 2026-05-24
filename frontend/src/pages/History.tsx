import type { MatchListItem } from '../types';

interface Props {
  matches: MatchListItem[];
  navigate: (path: string) => void;
  gameTypes: string[];
  selectedType: string;
  onTypeChange: (t: string) => void;
  onDeleteMatch?: (id: string) => void;
  onStopMatch?: (id: string) => void;
  invitations: Record<string, string>; // matchId → invitedBy
  currentUserName: string;
  isAdmin?: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function History({ matches, navigate, gameTypes, selectedType, onTypeChange, onDeleteMatch, onStopMatch, invitations, currentUserName, isAdmin }: Props) {
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 24, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', letterSpacing: '0.1em' }}>
          FILTER
        </span>
        {['all', ...gameTypes].map(type => {
          const label = type === 'all'
            ? 'All'
            : type.replace('catan-', '').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
          const active = selectedType === type;
          return (
            <button key={type} onClick={() => onTypeChange(type)} style={{
              padding: '5px 12px', borderRadius: 20,
              fontSize: 12, fontWeight: active ? 600 : 400,
              border: active ? '1px solid rgba(217,119,6,0.45)' : '1px solid #1a2e47',
              background: active ? 'rgba(217,119,6,0.1)' : 'transparent',
              color: active ? '#f59e0b' : '#64748b',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {label}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#334155' }}>
          {matches.length} {matches.length === 1 ? 'match' : 'matches'}
        </span>
      </div>

      {matches.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 24px',
          color: '#243d5a', fontSize: 15,
        }}>
          No matches yet — start one from the Dashboard.
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 12,
      }}>
        {matches.map(match => {
          const isLive = match.status === 'LIVE';
          const isPaused = match.status === 'PAUSED';
          const invitedBy = invitations[match.id];
          const startedByYou = match.createdBy === currentUserName;
          const startedByLabel = match.createdBy
            ? (startedByYou ? 'Started by you' : `Started by ${match.createdBy}`)
            : null;
          return (
            <div
              key={match.id}
              className="fade-up"
              style={{
                background: '#0d1827',
                border: `1px solid ${isLive ? 'rgba(34,197,94,0.25)' : isPaused ? 'rgba(234,179,8,0.25)' : '#1a2e47'}`,
                borderRadius: 12, padding: '14px 16px', position: 'relative',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onClick={() => navigate(`/matches/${match.id}`)}
            >
              {/* Source badge */}
              {invitedBy && (
                <div style={{
                  marginBottom: 8, padding: '3px 8px', borderRadius: 4,
                  fontSize: 10, fontWeight: 600,
                  background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)',
                  color: '#d97706', display: 'inline-block',
                }}>
                  Invited by {invitedBy}
                </div>
              )}
              {!invitedBy && startedByLabel && (
                <div style={{
                  marginBottom: 8, padding: '3px 8px', borderRadius: 4,
                  fontSize: 10, fontWeight: 600,
                  background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)',
                  color: '#60a5fa', display: 'inline-block',
                }}>
                  {startedByLabel}
                </div>
              )}
              {/* Status + game type */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  padding: '2px 7px', borderRadius: 4,
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.07em',
                  background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.25)',
                  color: '#d97706', textTransform: 'uppercase',
                }}>
                  {match.gameType}
                </span>
                {isLive ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, color: '#22c55e',
                  }}>
                    <span className="live-dot" style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#22c55e', display: 'inline-block',
                    }} />
                    LIVE
                  </span>
                ) : isPaused ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#eab308' }}>
                    ⏸ PAUSED
                  </span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#334155' }}>
                    DONE
                  </span>
                )}
              </div>

              {/* Players */}
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                {match.players.join(' · ')}
              </div>

              {/* Winner */}
              {match.winner && (
                <div style={{
                  fontSize: 13, fontWeight: 600, color: '#eab308',
                  marginBottom: 8,
                }}>
                  🏆 {match.winner}
                </div>
              )}
              {!match.winner && !isLive && (
                <div style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>
                  No winner recorded
                </div>
              )}
              {isLive && !match.winner && (
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontStyle: 'italic' }}>
                  In progress…
                </div>
              )}

              {/* Date + actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ fontSize: 11, color: '#334155' }}>
                  {formatDate(match.createdAt)}
                </div>
                {(isAdmin || startedByYou) && (
                  <div style={{ display: 'flex', gap: 5 }}>
                    {onStopMatch && (isLive || isPaused) && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm('Stop this match? It will be marked as completed.')) onStopMatch(match.id);
                        }}
                        style={{
                          padding: '3px 8px', borderRadius: 5, fontSize: 11,
                          border: '1px solid rgba(234,179,8,0.3)',
                          background: 'rgba(234,179,8,0.07)',
                          color: '#fbbf24', cursor: 'pointer',
                        }}
                      >
                        Stop
                      </button>
                    )}
                    {onDeleteMatch && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm('Delete this match permanently?')) onDeleteMatch(match.id);
                        }}
                        style={{
                          padding: '3px 8px', borderRadius: 5, fontSize: 11,
                          border: '1px solid rgba(239,68,68,0.25)',
                          background: 'rgba(239,68,68,0.06)',
                          color: '#f87171', cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
