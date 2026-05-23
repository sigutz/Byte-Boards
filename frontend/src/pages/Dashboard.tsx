import { useState as useLocalState } from 'react';
import type { Agent, AgentMetric, MatchDetail, Trait, TraitInfo } from '../types';
import { PLAYER_COLORS, EVENT_STYLES, TARGET_SCORE, apiFetch } from '../types';

interface Props {
  gameTypes: string[];
  selectedType: string;
  onTypeChange: (t: string) => void;
  agents: Agent[];
  metrics: AgentMetric[];
  selectedAgentIds: number[];
  toggleAgent: (id: number) => void;
  isCreatingMatch: boolean;
  hasLiveMatch: boolean;
  startMatch: () => void;
  onPauseResume: (matchId: string, action: 'pause' | 'resume') => void;
  selectedMatch: MatchDetail | null;
  copyShareLink: () => void;
  linkCopied: boolean;
  navigate: (path: string) => void;
  error: string;
  onAgentCreated: () => void;
}

const TRAIT_COLORS: Record<Trait, { hex: string; bg: string }> = {
  Empathic:     { hex: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  Greedy:       { hex: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  HardTrader:   { hex: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  Aggressive:   { hex: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  Expansionist: { hex: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  Defensive:    { hex: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

function BotCreator({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useLocalState(false);
  const [name, setName] = useLocalState('');
  const [description, setDescription] = useLocalState('');
  const [selectedTraits, setSelectedTraits] = useLocalState<Trait[]>([]);
  const [traitInfos, setTraitInfos] = useLocalState<TraitInfo[]>([]);
  const [saving, setSaving] = useLocalState(false);
  const [err, setErr] = useLocalState('');

  async function fetchTraits() {
    if (traitInfos.length > 0) return;
    try {
      const data = await apiFetch<TraitInfo[]>('/api/traits');
      setTraitInfos(data);
    } catch { /* ignore */ }
  }

  function toggleTrait(t: Trait) {
    setSelectedTraits(cur => {
      if (cur.includes(t)) return cur.filter(x => x !== t);
      if (cur.length >= 3) return cur;
      return [...cur, t];
    });
    setErr('');
  }

  function isConflicting(t: Trait): boolean {
    const info = traitInfos.find(i => i.name === t);
    if (!info) return false;
    return selectedTraits.some(s => info.conflicts.includes(s) || traitInfos.find(i => i.name === s)?.conflicts.includes(t));
  }

  async function save() {
    setErr('');
    if (!name.trim()) { setErr('Enter a name'); return; }
    setSaving(true);
    try {
      await apiFetch('/api/agents', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, traits: selectedTraits }),
      });
      setName(''); setDescription(''); setSelectedTraits([]); setOpen(false);
      onCreated();
    } catch (e) {
      setErr((e as Error).message ?? 'Could not create agent');
    } finally { setSaving(false); }
    
  }

  return (
    <div>
      <button
        onClick={() => { setOpen(o => !o); void fetchTraits(); }}
        style={{
          width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12,
          border: '1px dashed #1a3a5c', background: 'transparent',
          color: '#334155', cursor: 'pointer', textAlign: 'left',
          transition: 'all 0.15s',
        }}
      >
        {open ? '✕ Cancel' : '+ Create Bot'}
      </button>

      {open && (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 8,
          background: '#0a1520', border: '1px solid #1a2e47',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Bot name…"
            maxLength={32}
            style={{
              background: '#0d1827', border: '1px solid #1a2e47', borderRadius: 6,
              padding: '6px 9px', color: '#f1f5f9', fontSize: 13, outline: 'none',
            }}
          />
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            maxLength={80}
            style={{
              background: '#0d1827', border: '1px solid #1a2e47', borderRadius: 6,
              padding: '6px 9px', color: '#94a3b8', fontSize: 12, outline: 'none',
            }}
          />

          <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: '0.08em' }}>
            PERSONALITY TRAITS (pick up to 3)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {traitInfos.map(info => {
              const selected = selectedTraits.includes(info.name);
              const conflicting = !selected && isConflicting(info.name);
              const c = TRAIT_COLORS[info.name];
              return (
                <button
                  key={info.name}
                  onClick={() => !conflicting && toggleTrait(info.name)}
                  title={info.description}
                  style={{
                    padding: '6px 9px', borderRadius: 6, textAlign: 'left',
                    border: selected ? `1px solid ${c.hex}66` : `1px solid ${conflicting ? '#1a1a2e' : '#1a2e47'}`,
                    background: selected ? c.bg : conflicting ? '#05080d' : 'transparent',
                    cursor: conflicting ? 'not-allowed' : 'pointer',
                    opacity: conflicting ? 0.35 : 1,
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: selected ? c.hex : '#1a2e47',
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: selected ? c.hex : '#475569' }}>
                      {info.name}
                    </span>
                    {info.conflicts.length > 0 && (
                      <span style={{ fontSize: 10, color: '#243d5a', marginLeft: 'auto' }}>
                        ✗ {info.conflicts.join(', ')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#334155', paddingLeft: 14, marginTop: 2 }}>
                    {info.description}
                  </div>
                </button>
              );
            })}
          </div>

          {err && <div style={{ fontSize: 11, color: '#f87171' }}>{err}</div>}

          <button
            onClick={() => void save()}
            disabled={saving || !name.trim()}
            style={{
              padding: '8px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
              background: saving || !name.trim()
                ? 'rgba(217,119,6,0.08)'
                : 'linear-gradient(135deg, #d97706, #b45309)',
              color: saving || !name.trim() ? '#7c4a00' : 'white',
            }}
          >
            {saving ? 'Creating…' : 'Create Bot'}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'LIVE' | 'PAUSED' | 'COMPLETED' }) {
  if (status === 'LIVE') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 20,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
        background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)',
        color: '#22c55e',
      }}>
        <span className="live-dot" style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#22c55e', flexShrink: 0, display: 'inline-block',
        }} />
        LIVE
      </span>
    );
  }
  if (status === 'PAUSED') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 20,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
        background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)',
        color: '#eab308',
      }}>
        ⏸ PAUSED
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
      background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
      color: '#60a5fa',
    }}>
      DONE
    </span>
  );
}

function VPBar({ score, color }: { score: number; color: string }) {
  const pct = Math.min((score / TARGET_SCORE) * 100, 100);
  return (
    <div style={{ height: 5, borderRadius: 3, background: '#1a2e47', overflow: 'hidden', flex: 1 }}>
      <div
        className="vp-bar-fill"
        style={{
          height: '100%', width: `${pct}%`, borderRadius: 3,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: 'width 0.5s ease',
        }}
      />
    </div>
  );
}

export default function Dashboard({
  gameTypes, selectedType, onTypeChange,
  agents, metrics, selectedAgentIds, toggleAgent,
  isCreatingMatch, hasLiveMatch, startMatch, onPauseResume,
  selectedMatch, copyShareLink, linkCopied, navigate, error,
  onAgentCreated,
}: Props) {
  const selectedCount = selectedAgentIds.length;

  function getColorIdx(agentId: number) {
    const i = selectedAgentIds.indexOf(agentId);
    return i >= 0 ? i % PLAYER_COLORS.length : -1;
  }

  function getMetric(agentId: number): AgentMetric | undefined {
    return metrics.find(m => Number(m.agentId) === agentId);
  }

  const events = selectedMatch ? [...selectedMatch.events].reverse().slice(0, 24) : [];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 20,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'clamp(260px, 280px, 300px) 1fr',
        gap: 16, alignItems: 'start',
      }}>
        {/* ── Left sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Game type */}
          <div style={{
            background: '#0d1827', border: '1px solid #1a2e47',
            borderRadius: 12, padding: 16,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', letterSpacing: '0.1em', marginBottom: 10 }}>
              GAME TYPE
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {['all', ...gameTypes].map((type) => {
                const label = type === 'all'
                  ? 'Default'
                  : type.replace('catan-', '').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
                const active = selectedType === type;
                return (
                  <button key={type} onClick={() => onTypeChange(type)} style={{
                    padding: '7px 10px', borderRadius: 7, fontSize: 13,
                    fontWeight: active ? 600 : 400, textAlign: 'left',
                    border: active ? '1px solid rgba(217,119,6,0.45)' : '1px solid transparent',
                    background: active ? 'rgba(217,119,6,0.1)' : 'transparent',
                    color: active ? '#f59e0b' : '#64748b',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agent selector */}
          <div style={{
            background: '#0d1827', border: '1px solid #1a2e47',
            borderRadius: 12, padding: 16,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', letterSpacing: '0.1em', marginBottom: 4 }}>
              PLAYERS
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
              {selectedCount < 2
                ? `Select at least ${2 - selectedCount} more`
                : `${selectedCount} of ${agents.length} selected`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {agents.map((agent, agentIdx) => {
                const colorIdx = getColorIdx(agent.id);
                const selected = colorIdx >= 0;
                const color = PLAYER_COLORS[selected ? colorIdx : agentIdx % PLAYER_COLORS.length];
                const metric = getMetric(agent.id);
                return (
                  <button key={agent.id} onClick={() => toggleAgent(agent.id)} style={{
                    padding: '9px 10px', borderRadius: 8, textAlign: 'left',
                    border: selected ? `1px solid ${color.hex}55` : '1px solid #1a2e47',
                    background: selected ? color.bg : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                        background: selected ? color.hex : '#243d5a',
                        transition: 'background 0.15s',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600, lineHeight: 1.3,
                          color: selected ? '#f1f5f9' : '#64748b',
                        }}>
                          {agent.name}
                        </div>
                        {agent.description && (
                          <div style={{
                            fontSize: 11, color: '#475569', lineHeight: 1.3,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {agent.description}
                          </div>
                        )}
                        {metric && metric.gamesPlayed > 0 && (
                          <div style={{ fontSize: 10, color: '#334155', marginTop: 2 }}>
                            {metric.wins}W/{metric.gamesPlayed}G · {Math.round(metric.winRate * 100)}% WR
                          </div>
                        )}
                        {agent.traits && agent.traits.length > 0 && (
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
                            {agent.traits.map(t => (
                              <span key={t} style={{
                                fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                                padding: '1px 5px', borderRadius: 3,
                                background: TRAIT_COLORS[t].bg,
                                color: TRAIT_COLORS[t].hex,
                                border: `1px solid ${TRAIT_COLORS[t].hex}33`,
                              }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {selected && (
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: color.hex, flexShrink: 0, letterSpacing: '0.04em',
                        }}>
                          P{colorIdx + 1}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <BotCreator onCreated={onAgentCreated} />

            <button
              onClick={() => void startMatch()}
              disabled={isCreatingMatch || hasLiveMatch || selectedCount < 2}
              style={{
                marginTop: 14, width: '100%', padding: '10px', borderRadius: 8,
                fontSize: 14, fontWeight: 600, border: 'none',
                cursor: isCreatingMatch || hasLiveMatch || selectedCount < 2 ? 'not-allowed' : 'pointer',
                background: isCreatingMatch || hasLiveMatch || selectedCount < 2
                  ? 'rgba(217,119,6,0.1)'
                  : 'linear-gradient(135deg, #d97706, #b45309)',
                color: isCreatingMatch || hasLiveMatch || selectedCount < 2 ? '#7c4a00' : 'white',
                transition: 'all 0.15s',
                letterSpacing: '0.03em',
              }}
            >
              {isCreatingMatch ? 'Starting…' : hasLiveMatch ? 'Match in progress' : 'Start Match'}
            </button>
          </div>
        </div>

        {/* ── Right: live match ── */}
        <div className="fade-up">
          {!selectedMatch ? (
            <div style={{
              background: '#0d1827', border: '1px dashed #1a2e47',
              borderRadius: 12, padding: '60px 24px', textAlign: 'center',
            }}>
              <div style={{
                width: 52, height: 52, margin: '0 auto 14px',
                background: 'rgba(217,119,6,0.08)', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>⬡</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                No active match
              </div>
              <div style={{ fontSize: 13, color: '#243d5a' }}>
                Select at least 2 agents and click Start Match
              </div>
            </div>
          ) : (
            <div style={{
              background: '#0d1827', border: '1px solid #1a2e47',
              borderRadius: 12, overflow: 'hidden',
            }}>
              {/* Match header */}
              <div style={{
                padding: '12px 18px', borderBottom: '1px solid #1a2e47',
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                background: 'rgba(217,119,6,0.03)',
              }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4,
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
                  background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)',
                  color: '#d97706', textTransform: 'uppercase',
                }}>
                  {selectedMatch.gameType}
                </span>
                <StatusBadge status={selectedMatch.status} />
                {selectedMatch.winner && (
                  <span style={{ color: '#eab308', fontSize: 13, fontWeight: 600 }}>
                    🏆 {selectedMatch.winner}
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {(selectedMatch.status === 'LIVE' || selectedMatch.status === 'PAUSED') && (
                    <button
                      onClick={() => onPauseResume(selectedMatch.id, selectedMatch.status === 'LIVE' ? 'pause' : 'resume')}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12,
                        border: `1px solid ${selectedMatch.status === 'LIVE' ? 'rgba(234,179,8,0.4)' : 'rgba(34,197,94,0.4)'}`,
                        background: 'transparent', cursor: 'pointer',
                        color: selectedMatch.status === 'LIVE' ? '#eab308' : '#22c55e',
                      }}
                    >
                      {selectedMatch.status === 'LIVE' ? '⏸ Pause' : '▶ Resume'}
                    </button>
                  )}
                  <button onClick={() => void copyShareLink()} style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12,
                    border: '1px solid #1a2e47', background: 'transparent',
                    color: linkCopied ? '#22c55e' : '#64748b', cursor: 'pointer',
                  }}>
                    {linkCopied ? 'Copied!' : 'Share'}
                  </button>
                  <button onClick={() => navigate(`/matches/${selectedMatch.id}`)} style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12,
                    border: '1px solid #1a2e47', background: 'transparent',
                    color: '#64748b', cursor: 'pointer',
                  }}>
                    Detail →
                  </button>
                </div>
              </div>

              {/* Standings */}
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #1a2e47' }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#334155',
                  letterSpacing: '0.1em', marginBottom: 12,
                }}>
                  STANDINGS — {TARGET_SCORE} VP TO WIN
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[...selectedMatch.standings]
                    .sort((a, b) => b.score - a.score)
                    .map((entry, idx) => {
                      const seatIdx = ((entry.seat ?? (idx + 1)) - 1) % PLAYER_COLORS.length;
                      const color = PLAYER_COLORS[seatIdx];
                      const isWinner = selectedMatch.winner === entry.name;
                      const hasResources = entry.wood !== undefined;
                      return (
                        <div key={entry.agentId}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 22, fontSize: 13, fontWeight: 700, flexShrink: 0,
                              color: isWinner ? '#eab308' : '#334155',
                            }}>
                              {isWinner ? '🏆' : `#${idx + 1}`}
                            </div>
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: color.hex, flexShrink: 0,
                            }} />
                            <div style={{
                              fontSize: 13, fontWeight: 600, color: '#cbd5e1',
                              width: 90, flexShrink: 0,
                            }}>
                              {entry.name}
                            </div>
                            <VPBar score={entry.score} color={color.hex} />
                            <div style={{
                              fontSize: 13, fontWeight: 700, color: color.hex,
                              width: 52, textAlign: 'right', flexShrink: 0,
                            }}>
                              {entry.score}
                              <span style={{ fontSize: 10, fontWeight: 400, color: '#334155' }}>/{TARGET_SCORE}</span>
                            </div>
                          </div>
                          {hasResources && (
                            <div style={{
                              display: 'flex', gap: 6, paddingLeft: 40,
                              marginTop: 4, flexWrap: 'wrap',
                            }}>
                              {([
                                { key: 'wood',  icon: '🪵', val: entry.wood  ?? 0 },
                                { key: 'brick', icon: '🧱', val: entry.brick ?? 0 },
                                { key: 'ore',   icon: '⛏️', val: entry.ore   ?? 0 },
                                { key: 'wheat', icon: '🌾', val: entry.wheat ?? 0 },
                                { key: 'sheep', icon: '🐑', val: entry.sheep ?? 0 },
                              ] as const).map(({ key, icon, val }) => (
                                <span key={key} style={{
                                  fontSize: 10, color: val > 0 ? '#94a3b8' : '#1e3a5f',
                                  display: 'inline-flex', alignItems: 'center', gap: 2,
                                }}>
                                  {icon} {val}
                                </span>
                              ))}
                              <span style={{ fontSize: 10, color: '#334155', marginLeft: 4 }}>
                                🏠{entry.settlements ?? 2} 🏙️{entry.cities ?? 0} 🛤️{entry.roads ?? 0}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Event feed */}
              <div style={{ padding: '14px 18px' }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#334155',
                  letterSpacing: '0.1em', marginBottom: 10,
                }}>
                  LIVE EVENTS
                </div>
                <div className="scroll-feed" style={{
                  maxHeight: 280, overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  {events.map((ev) => {
                    const s = EVENT_STYLES[ev.type] ?? EVENT_STYLES['COMMENTARY'];
                    return (
                      <div key={ev.id} style={{
                        display: 'flex', gap: 8, padding: '5px 8px', borderRadius: 5,
                        background: 'rgba(255,255,255,0.018)',
                        borderLeft: `2px solid ${s.color}35`,
                        fontSize: 12, lineHeight: 1.5,
                      }}>
                        <span style={{
                          fontFamily: 'monospace', fontSize: 10,
                          color: '#334155', flexShrink: 0, paddingTop: 1, width: 28,
                        }}>
                          T{ev.turn}
                        </span>
                        <span style={{
                          color: s.color, fontSize: 9, fontWeight: 700,
                          letterSpacing: '0.07em', flexShrink: 0,
                          paddingTop: 2, width: 32,
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
          )}
        </div>
      </div>
    </div>
  );
}
