import type { MatchDetail as MatchDetailType } from '../types';
import { PLAYER_COLORS, EVENT_STYLES, TARGET_SCORE } from '../types';

interface Props {
  match: MatchDetailType | null;
  navigate: (path: string) => void;
  copyShareLink: () => void;
}

function VPBar({ score, color }: { score: number; color: string }) {
  const pct = Math.min((score / TARGET_SCORE) * 100, 100);
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#1a2e47', overflow: 'hidden', flex: 1 }}>
      <div
        className="vp-bar-fill"
        style={{
          height: '100%', width: `${pct}%`, borderRadius: 3,
          background: `linear-gradient(90deg, ${color}77, ${color})`,
          transition: 'width 0.5s ease',
        }}
      />
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

export default function MatchDetailPage({ match, navigate, copyShareLink }: Props) {
  if (!match) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px', textAlign: 'center', color: '#334155' }}>
        <div style={{ marginTop: 60, fontSize: 15 }}>Loading match…</div>
      </div>
    );
  }

  const isLive = match.status === 'LIVE';
  const { overview, keyMoments } = splitSummary(match.summary);
  const sortedStandings = [...match.standings].sort((a, b) => b.score - a.score);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px' }}>
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
        <span style={{
          padding: '3px 9px', borderRadius: 5,
          fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
          background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)',
          color: '#d97706', textTransform: 'uppercase',
        }}>
          {match.gameType}
        </span>
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => void copyShareLink()} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12,
            border: '1px solid #1a2e47', background: 'transparent',
            color: '#64748b', cursor: 'pointer',
          }}>
            Copy share link
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Standings */}
        <div style={{
          background: '#0d1827', border: '1px solid #1a2e47',
          borderRadius: 12, padding: '16px 18px',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#334155',
            letterSpacing: '0.1em', marginBottom: 14,
          }}>
            FINAL STANDINGS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortedStandings.map((entry, idx) => {
              const seatIdx = ((entry.seat ?? (idx + 1)) - 1) % PLAYER_COLORS.length;
              const color = PLAYER_COLORS[seatIdx];
              const isWinner = match.winner === entry.name;
              return (
                <div key={entry.agentId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 22, fontSize: 14, fontWeight: 700, flexShrink: 0,
                    color: isWinner ? '#eab308' : '#334155',
                  }}>
                    {isWinner ? '🏆' : `#${idx + 1}`}
                  </div>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: color.hex, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>
                      {entry.name}
                    </div>
                    <VPBar score={entry.score} color={color.hex} />
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: color.hex,
                    flexShrink: 0, width: 44, textAlign: 'right',
                  }}>
                    {entry.score}
                    <span style={{ fontSize: 10, fontWeight: 400, color: '#334155' }}>VP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div style={{
          background: '#0d1827', border: '1px solid #1a2e47',
          borderRadius: 12, padding: '16px 18px',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#334155',
            letterSpacing: '0.1em', marginBottom: 12,
          }}>
            MATCH SUMMARY
          </div>
          {!match.summary && (
            <div style={{ fontSize: 13, color: '#334155', fontStyle: 'italic' }}>
              {isLive ? 'Summary will appear after the match ends.' : 'No summary available.'}
            </div>
          )}
          {overview && (
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.6 }}>
              {overview}
            </p>
          )}
          {keyMoments.length > 0 && (
            <>
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#334155',
                letterSpacing: '0.08em', marginBottom: 8,
              }}>
                KEY MOMENTS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {keyMoments.map((m, i) => (
                  <div key={i} style={{
                    fontSize: 12, color: '#94a3b8', padding: '5px 8px',
                    borderLeft: '2px solid rgba(234,179,8,0.4)',
                    background: 'rgba(234,179,8,0.04)', borderRadius: '0 5px 5px 0',
                    lineHeight: 1.5,
                  }}>
                    {m}
                  </div>
                ))}
              </div>
            </>
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
