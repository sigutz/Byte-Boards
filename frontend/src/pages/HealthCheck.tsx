import { useEffect, useState } from 'react';
import { API_BASE } from '../types';

type HealthData = {
  backend: boolean;
  database: boolean;
  databaseUrl: string | null;
  databaseError?: string;
};

type Status = 'idle' | 'loading' | 'ok' | 'error';

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 700,
        background: ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        color: ok ? '#4ade80' : '#f87171',
        border: `1px solid ${ok ? '#16a34a' : '#dc2626'}`,
      }}
    >
      {label}
    </span>
  );
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 0',
        borderBottom: '1px solid #1c2a3a',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: detail ? 4 : 0 }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', wordBreak: 'break-all' }}>{detail}</div>}
      </div>
      <Badge ok={ok} label={ok ? 'OK' : 'FAIL'} />
    </div>
  );
}

export default function HealthCheck({ navigate }: { navigate: (path: string) => void }) {
  const [status, setStatus] = useState<Status>('idle');
  const [data, setData] = useState<HealthData | null>(null);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);

  async function runCheck() {
    setStatus('loading');
    setData(null);
    setBackendReachable(null);
    let reached = false;
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      reached = true;
      setBackendReachable(true);
      const json = await res.json() as HealthData;
      setData(json);
      setStatus('ok');
    } catch (e) {
      setBackendReachable(reached ? true : false);
      setStatus('error');
    }
  }

  useEffect(() => { void runCheck(); }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#080c14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, marginBottom: 20, padding: 0 }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Health Check</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
          Verifies connectivity between the browser, backend, and database.
        </p>

        <div style={{ background: '#0f1923', border: '1px solid #1c2a3a', borderRadius: 10, padding: '4px 20px 4px' }}>
          <Row
            label="Frontend → Backend"
            ok={backendReachable === true}
            detail={`API_BASE: ${API_BASE}`}
          />

          {status === 'ok' && data ? (
            <Row
              label="Backend → Database"
              ok={data.database}
              detail={data.databaseUrl ?? undefined}
            />
          ) : (
            <div style={{ padding: '14px 0', color: '#64748b', fontSize: 13 }}>
              {status === 'loading' ? 'Checking…' : backendReachable === false ? 'Cannot reach backend — database status unknown.' : ''}
            </div>
          )}

          {data?.databaseError && (
            <div style={{ padding: '10px 0', fontSize: 12, color: '#f87171', fontFamily: 'monospace' }}>
              DB error: {data.databaseError}
            </div>
          )}
        </div>

        <button
          onClick={() => void runCheck()}
          disabled={status === 'loading'}
          style={{
            marginTop: 20,
            padding: '10px 20px',
            background: '#1e3a5f',
            color: '#e2e8f0',
            border: '1px solid #2563eb',
            borderRadius: 6,
            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {status === 'loading' ? 'Checking…' : 'Re-check'}
        </button>
      </div>
    </div>
  );
}
