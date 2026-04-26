import type { Agent, AgentMetric } from '../types';
import { PLAYER_COLORS } from '../types';

interface Props {
  metrics: AgentMetric[];
  agents: Agent[];
}

export default function Performance({ metrics, agents }: Props) {
  const sorted = [...metrics].sort((a, b) => b.winRate - a.winRate);

  function getColorIdx(agentId: string | number): number {
    const idx = agents.findIndex(a => String(a.id) === String(agentId));
    return idx >= 0 ? idx % PLAYER_COLORS.length : 0;
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', letterSpacing: '0.1em', marginBottom: 4 }}>
          AGENT LEADERBOARD
        </div>
        <div style={{ fontSize: 13, color: '#334155' }}>
          Ranked by win rate across completed matches
        </div>
      </div>

      {sorted.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#243d5a', fontSize: 15 }}>
          No match data yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map((m, rank) => {
          const colorIdx = getColorIdx(m.agentId);
          const color = PLAYER_COLORS[colorIdx];
          const agent = agents.find(a => String(a.id) === String(m.agentId));
          const winPct = Math.round(m.winRate * 100);

          return (
            <div
              key={m.agentId}
              className="fade-up"
              style={{
                background: '#0d1827',
                border: `1px solid ${rank === 0 ? 'rgba(234,179,8,0.3)' : '#1a2e47'}`,
                borderRadius: 12, padding: '16px 20px',
                display: 'grid',
                gridTemplateColumns: '32px 160px 1fr auto',
                alignItems: 'center', gap: 16,
              }}
            >
              {/* Rank */}
              <div style={{
                fontSize: rank === 0 ? 20 : 15,
                fontWeight: 700,
                color: rank === 0 ? '#eab308' : rank === 1 ? '#94a3b8' : rank === 2 ? '#b45309' : '#334155',
                textAlign: 'center',
              }}>
                {rank === 0 ? '🏆' : `#${rank + 1}`}
              </div>

              {/* Agent info */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                  <div style={{
                    width: 9, height: 9, borderRadius: '50%',
                    background: color.hex, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
                    {m.name}
                  </span>
                </div>
                {agent?.description && (
                  <div style={{ fontSize: 11, color: '#475569', paddingLeft: 16 }}>
                    {agent.description}
                  </div>
                )}
              </div>

              {/* Win rate bar */}
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
                }}>
                  <div style={{
                    flex: 1, height: 6, borderRadius: 3,
                    background: '#1a2e47', overflow: 'hidden',
                  }}>
                    <div
                      className="vp-bar-fill"
                      style={{
                        height: '100%', borderRadius: 3,
                        width: `${winPct}%`,
                        background: `linear-gradient(90deg, ${color.hex}77, ${color.hex})`,
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: color.hex, width: 38, textAlign: 'right',
                  }}>
                    {winPct}%
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#475569' }}>
                  <span>{m.wins} wins</span>
                  <span>{m.gamesPlayed} games</span>
                  <span>avg {m.averageScore.toFixed(1)} VP</span>
                </div>
              </div>

              {/* Big stat */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: color.hex, lineHeight: 1 }}>
                  {winPct}
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>%</span>
                </div>
                <div style={{ fontSize: 10, color: '#334155', letterSpacing: '0.05em', marginTop: 2 }}>
                  WIN RATE
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
