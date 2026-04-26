import type { SharePayload } from '../types';

interface Props {
  shareData: SharePayload | null;
  error: string;
  navigate: (path: string) => void;
}

export default function Share({ shareData, error, navigate }: Props) {
  return (
    <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
      <div style={{
        width: 48, height: 48, margin: '0 auto 16px',
        background: 'rgba(217,119,6,0.1)', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
      }}>
        ⬡
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', letterSpacing: '0.1em', marginBottom: 6 }}>
        SHARED MATCH
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {!error && !shareData && (
        <div style={{ color: '#334155', fontSize: 14 }}>Loading…</div>
      )}

      {shareData && (
        <div style={{
          background: '#0d1827', border: '1px solid #1a2e47',
          borderRadius: 14, padding: '24px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: '0.1em', marginBottom: 5 }}>
              GAME
            </div>
            <div style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 5,
              fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
              background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)',
              color: '#d97706', textTransform: 'uppercase',
            }}>
              {shareData.gameType}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: '0.1em', marginBottom: 5 }}>
              STATUS
            </div>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: shareData.status === 'LIVE' ? '#22c55e' : '#60a5fa',
            }}>
              {shareData.status === 'LIVE' ? 'In progress' : 'Completed'}
            </div>
          </div>

          {shareData.winner && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: '0.1em', marginBottom: 5 }}>
                WINNER
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#eab308' }}>
                🏆 {shareData.winner}
              </div>
            </div>
          )}

          {shareData.summary && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: '0.1em', marginBottom: 6 }}>
                SUMMARY
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                {shareData.summary.split('Key moments:')[0].trim()}
              </p>
            </div>
          )}

          <button
            onClick={() => navigate('/')}
            style={{
              marginTop: 4, padding: '9px', borderRadius: 8,
              fontSize: 13, fontWeight: 600, border: 'none',
              background: 'rgba(217,119,6,0.1)',
              color: '#d97706', cursor: 'pointer',
            }}
          >
            Open Arena →
          </button>
        </div>
      )}
    </div>
  );
}
