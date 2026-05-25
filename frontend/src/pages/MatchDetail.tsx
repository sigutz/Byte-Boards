import { useState } from 'react';
import type { MatchDetail as MatchDetailType, Standing, DevCardType, MatchEvent } from '../types';
import { PLAYER_COLORS, EVENT_STYLES, apiFetch } from '../types';
import CatanBoard from '../components/CatanBoard';

interface Props {
  match: MatchDetailType | null;
  navigate: (path: string) => void;
  copyShareLink: () => void;
  linkCopied?: boolean;
  invitedBy?: string;
  currentUserId?: number;
  isAdmin?: boolean;
  onStopMatch?: (id: string) => void;
  onDeleteMatch?: (id: string) => void;
}

function PlayerResources({ standings, winner, events, isSeafarers }: { standings: Standing[]; winner: string | null; events: MatchEvent[]; isSeafarers: boolean }) {
  const [expanded, setExpanded] = useState(new Set<string>());
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const sorted = [...standings].sort((a, b) => b.score - a.score);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map((s, idx) => {
        const seatIdx = ((s.seat ?? (idx + 1)) - 1) % PLAYER_COLORS.length;
        const color = PLAYER_COLORS[seatIdx];
        const isWinner = s.name === winner;
        const isOpen = expanded.has(s.agentId);
        const playerEvents = events.filter(ev => ev.actor === s.name);
        return (
          <div key={s.agentId} style={{
            background: '#0d1827',
            border: `1px solid ${isWinner ? 'rgba(234,179,8,0.4)' : '#1a2e47'}`,
            borderRadius: 10, padding: '11px 14px',
          }}>
            {/* Name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {isWinner && <span style={{ fontSize: 14 }}>🏆</span>}
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: color.hex, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{s.name}</div>
                {s.createdBy && (
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>by {s.createdBy}</div>
                )}
              </div>
              <span style={{
                fontSize: 12, fontWeight: 700, color: color.hex,
                background: color.bg, padding: '1px 7px', borderRadius: 4,
              }}>
                {s.score} VP
              </span>
              <button
                onClick={() => toggle(s.agentId)}
                style={{
                  background: 'none', border: '1px solid #1a2e47', cursor: 'pointer',
                  color: '#475569', borderRadius: 4, padding: '2px 7px',
                  fontSize: 11, lineHeight: 1, flexShrink: 0,
                }}
              >
                {isOpen ? '▲' : '▼'}
              </button>
            </div>
            {/* Resources */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              {([
                { icon: '🪵', val: s.wood  ?? 0, label: 'wood'  },
                { icon: '🧱', val: s.brick ?? 0, label: 'brick' },
                { icon: '⛏️', val: s.ore   ?? 0, label: 'ore'   },
                { icon: '🌾', val: s.wheat ?? 0, label: 'wheat' },
                { icon: '🐑', val: s.sheep ?? 0, label: 'sheep' },
              ] as const).map(({ icon, val, label }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '3px 7px', borderRadius: 5,
                  background: val > 0 ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: val > 0 ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
                  minWidth: 36,
                }}>
                  <span style={{ fontSize: 12 }}>{icon}</span>
                  <span style={{ fontSize: 12, fontWeight: val > 0 ? 700 : 400, color: val > 0 ? '#cbd5e1' : '#334155' }}>
                    {val}
                  </span>
                </div>
              ))}
            </div>
            {/* Buildings row */}
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#475569', marginBottom: 5, flexWrap: 'wrap' }}>
              <span>🏠 {s.settlements ?? (s.settlementNodes?.length ?? 2)}</span>
              <span>🏙️ {s.cities ?? (s.cityNodes?.length ?? 0)}</span>
              <span>🛤️ {s.roads ?? (s.roadEdges?.length ?? 0)}</span>
              {isSeafarers && (
                <span style={{ color: '#22d3ee' }}>⛵ {(s.shipEdges ?? []).length}</span>
              )}
              {isSeafarers && (s.islandVPs ?? 0) > 0 && (
                <span style={{
                  color: '#a78bfa', fontWeight: 700,
                  padding: '0px 5px', borderRadius: 4,
                  background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)',
                }}>
                  🏝️ +{s.islandVPs} island VP
                </span>
              )}
            </div>
            {/* Dev cards */}
            {s.devCards && (() => {
              const dc = s.devCards;
              const devItems: { icon: string; label: string; key: DevCardType }[] = [
                { icon: '⚔️', label: 'Knight', key: 'knight' },
                { icon: '🌟', label: 'VP', key: 'vp' },
                { icon: '🛤️', label: 'Road', key: 'road_building' },
                { icon: '🎁', label: 'Plenty', key: 'year_of_plenty' },
                { icon: '🎭', label: 'Mono', key: 'monopoly' },
              ];
              const activeItems = devItems.filter(d => dc[d.key] > 0);
              if (activeItems.length === 0 && !s.hasLargestArmy && (s.knightsPlayed ?? 0) === 0) return null;
              return (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {activeItems.map(d => (
                    <div key={d.key} style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
                      fontSize: 11, color: '#a78bfa',
                    }}>
                      <span style={{ fontSize: 11 }}>{d.icon}</span>
                      <span>{d.label} ×{dc[d.key]}</span>
                    </div>
                  ))}
                  {(s.knightsPlayed ?? 0) > 0 && (
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {s.knightsPlayed} knight{(s.knightsPlayed ?? 0) !== 1 ? 's' : ''} played
                    </div>
                  )}
                  {s.hasLargestArmy && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.35)',
                      fontSize: 11, color: '#eab308', fontWeight: 700,
                    }}>
                      ⚔️ Largest Army +2 VP
                    </div>
                  )}
                  {s.hasLongestRoad && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)',
                      fontSize: 11, color: '#818cf8', fontWeight: 700,
                    }}>
                      🛤️ Longest Road +2 VP
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Per-player event log dropdown */}
            {isOpen && (
              <div style={{ marginTop: 10, borderTop: '1px solid #1a2e47', paddingTop: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#334155', letterSpacing: '0.1em', marginBottom: 6 }}>
                  MOVE LOG — {playerEvents.length} events
                </div>
                <div style={{
                  maxHeight: 200, overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {[...playerEvents].reverse().map(ev => {
                    const st = EVENT_STYLES[ev.type] ?? EVENT_STYLES['COMMENTARY'];
                    return (
                      <div key={ev.id} style={{
                        display: 'flex', gap: 6, padding: '4px 6px',
                        borderRadius: 4, fontSize: 11, lineHeight: 1.4,
                        background: 'rgba(255,255,255,0.015)',
                        borderLeft: `2px solid ${st.color}30`,
                      }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#334155', flexShrink: 0, paddingTop: 1, width: 24 }}>
                          T{ev.turn}
                        </span>
                        <span style={{ color: '#94a3b8' }}>{ev.text}</span>
                      </div>
                    );
                  })}
                  {playerEvents.length === 0 && (
                    <span style={{ fontSize: 11, color: '#334155', fontStyle: 'italic' }}>No events yet.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function parseTurnState(events: MatchEvent[], standings: Standing[]) {
  const currentTurn = events.reduce((max, e) => Math.max(max, e.turn), 0);

  let lastDice: number | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const m = events[i].text.match(/Dice:\s*\d+\+\d+=(\d+)/);
    if (m) { lastDice = parseInt(m[1], 10); break; }
  }

  let lastActor: string | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'MOVE' && events[i].actor) { lastActor = events[i].actor; break; }
  }

  const lastActionByPlayer = new Map<string, string>();
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === 'MOVE' && ev.actor && !lastActionByPlayer.has(ev.actor)) {
      const text = ev.text.startsWith(ev.actor + ' ') ? ev.text.slice(ev.actor.length + 1) : ev.text;
      lastActionByPlayer.set(ev.actor, text);
    }
    if (lastActionByPlayer.size === standings.length) break;
  }

  return { currentTurn, lastDice, lastActor, lastActionByPlayer };
}

function TurnSummary({ events, standings, pirateHex, isSeafarers }: { events: MatchEvent[]; standings: Standing[]; pirateHex: number | null; isSeafarers: boolean }) {
  const { currentTurn, lastDice, lastActor, lastActionByPlayer } = parseTurnState(events, standings);

  const playerColors = new Map<string, string>();
  standings.forEach((s, idx) => {
    const seatIdx = ((s.seat ?? (idx + 1)) - 1) % PLAYER_COLORS.length;
    playerColors.set(s.name, PLAYER_COLORS[seatIdx].hex);
  });

  return (
    <div style={{
      background: '#0d1827', border: '1px solid #1a2e47',
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#334155',
        letterSpacing: '0.1em', marginBottom: 12,
      }}>
        CURRENT TURN
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '8px 16px', borderRadius: 8,
          background: 'rgba(255,255,255,0.03)', border: '1px solid #1a2e47',
          minWidth: 60,
        }}>
          <span style={{ fontSize: 10, color: '#475569', letterSpacing: '0.08em', marginBottom: 4 }}>TURN</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>{currentTurn}</span>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '8px 16px', borderRadius: 8,
          background: lastDice === 7 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${lastDice === 7 ? 'rgba(239,68,68,0.3)' : '#1a2e47'}`,
          minWidth: 60,
        }}>
          <span style={{ fontSize: 10, color: '#475569', letterSpacing: '0.08em', marginBottom: 4 }}>DICE</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: lastDice === 7 ? '#ef4444' : '#e2e8f0' }}>
            {lastDice ?? '—'}
          </span>
        </div>

        {isSeafarers && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '8px 16px', borderRadius: 8,
            background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.25)',
            minWidth: 60,
          }}>
            <span style={{ fontSize: 10, color: '#22d3ee', letterSpacing: '0.08em', marginBottom: 4 }}>PIRATE</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#22d3ee' }}>
              {pirateHex !== null ? `T${pirateHex}` : '—'}
            </span>
          </div>
        )}

        {lastActor && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            padding: '8px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)', border: '1px solid #1a2e47',
            flex: 1,
          }}>
            <span style={{ fontSize: 10, color: '#475569', letterSpacing: '0.08em', marginBottom: 4 }}>LAST PLAYER</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: playerColors.get(lastActor) ?? '#64748b', flexShrink: 0,
              }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{lastActor}</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {standings.map((s, idx) => {
          const seatIdx = ((s.seat ?? (idx + 1)) - 1) % PLAYER_COLORS.length;
          const color = PLAYER_COLORS[seatIdx].hex;
          const action = lastActionByPlayer.get(s.name);
          return (
            <div key={s.agentId} style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              padding: '6px 10px', borderRadius: 6,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', flexShrink: 0, minWidth: 80 }}>{s.name}</span>
              <span style={{ fontSize: 11, color: '#475569' }}>
                {action ?? 'no actions yet'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function splitSummary(summary: string | null) {
  if (!summary) return { overview: '', keyMoments: [] as string[] };
  const marker = 'Key moments:';
  const idx = summary.indexOf(marker);
  if (idx === -1) return { overview: summary, keyMoments: [] };
  return {
    overview: summary.slice(0, idx).trim(),
    keyMoments: summary.slice(idx + marker.length).trim().split('|').map(s => s.trim()).filter(Boolean),
  };
}

export default function MatchDetailPage({ match, navigate, copyShareLink, linkCopied, invitedBy, currentUserId, isAdmin, onStopMatch, onDeleteMatch }: Props) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteOpen, setInviteOpen]   = useState(false);
  const [inviteMsg, setInviteMsg]     = useState('');

  async function sendInvite() {
    if (!match || !inviteEmail.trim()) return;
    try {
      const result = await apiFetch<{ ok: boolean; invitedName: string }>(
        `/api/matches/${match.id}/invite`,
        { method: 'POST', body: JSON.stringify({ email: inviteEmail.trim() }) },
      );
      setInviteMsg(`Invited ${result.invitedName}`);
      setInviteEmail('');
      setTimeout(() => setInviteMsg(''), 4000);
    } catch (e) {
      setInviteMsg((e as Error).message || 'Failed to invite');
    }
  }

  if (!match) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px', textAlign: 'center', color: '#334155' }}>
        <div style={{ marginTop: 60, fontSize: 15 }}>Loading match…</div>
      </div>
    );
  }

  const isLive = match.status === 'LIVE';
  const isSeafarers = match.gameType === 'catan-seafarers';
  const isOwner = isAdmin || (currentUserId != null && match.createdById === currentUserId);
  const isProtected = match.visibility === 'PROTECTED';
  const { overview, keyMoments } = splitSummary(match.summary);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      {invitedBy && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8,
          background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)',
          fontSize: 13, color: '#94a3b8',
        }}>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>{invitedBy}</span> has invited you to this match
        </div>
      )}
      {/* Back */}
      <button
        onClick={() => navigate('/history')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#475569', fontSize: 13, padding: '0 0 16px', display: 'flex',
          alignItems: 'center', gap: 5,
        }}
      >
        ← History
      </button>

      {/* Header card */}
      <div style={{
        background: '#0d1827', border: '1px solid #1a2e47',
        borderRadius: 12, padding: '16px 20px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        {isSeafarers ? (
          <span style={{
            padding: '3px 9px', borderRadius: 5,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
            background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.35)',
            color: '#22d3ee', textTransform: 'uppercase',
          }}>
            ⛵ Seafarers
          </span>
        ) : (
          <span style={{
            padding: '3px 9px', borderRadius: 5,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
            background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)',
            color: '#d97706', textTransform: 'uppercase',
          }}>
            {match.gameType}
          </span>
        )}
        {match.name && (
          <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
            {match.name}
          </span>
        )}
        {isLive ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 20,
            fontSize: 11, fontWeight: 700,
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)',
            color: '#22c55e',
          }}>
            <span className="live-dot" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#22c55e', display: 'inline-block',
            }} />
            LIVE
          </span>
        ) : (
          <span style={{
            padding: '3px 9px', borderRadius: 20,
            fontSize: 11, fontWeight: 700,
            background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
            color: '#60a5fa',
          }}>
            COMPLETED
          </span>
        )}
        {match.winner && (
          <span style={{ fontSize: 14, fontWeight: 700, color: '#eab308' }}>
            🏆 {match.winner}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isOwner && isProtected && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {inviteOpen ? (
                <>
                  <input
                    type="email"
                    placeholder="user@email.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && void sendInvite()}
                    style={{
                      padding: '4px 8px', borderRadius: 5, fontSize: 12,
                      border: '1px solid #1a2e47', background: '#0d1827',
                      color: '#cbd5e1', outline: 'none', width: 170,
                    }}
                  />
                  <button onClick={() => void sendInvite()} style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 12,
                    border: '1px solid rgba(34,211,238,0.3)', background: 'rgba(34,211,238,0.07)',
                    color: '#22d3ee', cursor: 'pointer',
                  }}>Send</button>
                  <button onClick={() => setInviteOpen(false)} style={{
                    padding: '5px 8px', borderRadius: 6, fontSize: 12,
                    border: '1px solid #1a2e47', background: 'transparent',
                    color: '#475569', cursor: 'pointer',
                  }}>✕</button>
                </>
              ) : (
                <button onClick={() => setInviteOpen(true)} style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12,
                  border: '1px solid rgba(34,211,238,0.3)', background: 'rgba(34,211,238,0.07)',
                  color: '#22d3ee', cursor: 'pointer',
                }}>
                  Invite watcher
                </button>
              )}
              {inviteMsg && <span style={{ fontSize: 11, color: inviteMsg.startsWith('Invited') ? '#22c55e' : '#f87171' }}>{inviteMsg}</span>}
            </div>
          )}
          <button onClick={() => void copyShareLink()} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12,
            border: '1px solid #1a2e47', background: 'transparent',
            color: linkCopied ? '#22c55e' : '#64748b', cursor: 'pointer',
          }}>
            {linkCopied ? 'Copied!' : 'Copy share link'}
          </button>
          {isOwner && isLive && onStopMatch && (
            <button
              onClick={() => { if (confirm('Stop this match?')) onStopMatch(match.id); }}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12,
                border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.07)',
                color: '#fbbf24', cursor: 'pointer',
              }}
            >
              Stop
            </button>
          )}
          {isOwner && onDeleteMatch && (
            <button
              onClick={() => { if (confirm('Delete this match permanently?')) { onDeleteMatch(match.id); navigate('/history'); } }}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12,
                border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)',
                color: '#f87171', cursor: 'pointer',
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* ── Board + Player resources ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 16, marginBottom: 14, alignItems: 'start',
      }}>
        {/* Left column: board + turn summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CatanBoard standings={match.standings} robberTile={match.robberTile ?? 9} pirateHex={match.pirateHex} isSeafarers={isSeafarers} />
          <TurnSummary events={match.events} standings={match.standings} pirateHex={match.pirateHex ?? null} isSeafarers={isSeafarers} />
        </div>

        {/* Right column: player resources + summary (completed only) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#334155',
              letterSpacing: '0.1em', marginBottom: 10,
            }}>
              PLAYERS
            </div>
            <PlayerResources standings={match.standings} winner={match.winner} events={match.events} isSeafarers={isSeafarers} />
          </div>

          {!isLive && (
            <div style={{
              background: '#0d1827', border: '1px solid #1a2e47',
              borderRadius: 12, padding: '14px 16px',
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#334155',
                letterSpacing: '0.1em', marginBottom: 10,
              }}>
                MATCH SUMMARY
              </div>
              {!match.summary && (
                <div style={{ fontSize: 12, color: '#334155', fontStyle: 'italic' }}>
                  No summary available.
                </div>
              )}
              {overview && (
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 10px', lineHeight: 1.6 }}>
                  {overview}
                </p>
              )}
              {keyMoments.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: '0.08em', marginBottom: 6 }}>
                    KEY MOMENTS
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {keyMoments.map((m, i) => (
                      <div key={i} style={{
                        fontSize: 12, color: '#94a3b8', padding: '4px 8px',
                        borderLeft: '2px solid rgba(234,179,8,0.4)',
                        background: 'rgba(234,179,8,0.04)', borderRadius: '0 4px 4px 0',
                        lineHeight: 1.5,
                      }}>
                        {m}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full event log */}
      <div style={{
        background: '#0d1827', border: '1px solid #1a2e47',
        borderRadius: 12, padding: '16px 18px',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#334155',
          letterSpacing: '0.1em', marginBottom: 12,
        }}>
          FULL EVENT LOG — {match.events.length} events
        </div>
        <div className="scroll-feed" style={{
          maxHeight: 400, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          {[...match.events].reverse().map(ev => {
            const s = EVENT_STYLES[ev.type] ?? EVENT_STYLES['COMMENTARY'];
            return (
              <div key={ev.id} style={{
                display: 'flex', gap: 8, padding: '5px 8px',
                borderRadius: 5, fontSize: 12, lineHeight: 1.5,
                background: 'rgba(255,255,255,0.015)',
                borderLeft: `2px solid ${s.color}30`,
              }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: 10,
                  color: '#334155', flexShrink: 0, paddingTop: 1, width: 28,
                }}>
                  T{ev.turn}
                </span>
                <span style={{
                  color: s.color, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.07em', flexShrink: 0, paddingTop: 2, width: 32,
                }}>
                  {s.label}
                </span>
                <span style={{ color: '#94a3b8' }}>
                  {ev.actor && <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{ev.actor}: </span>}
                  {ev.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
