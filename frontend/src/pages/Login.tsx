import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

interface Props {
  navigate: (path: string) => void;
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#0d1827', border: '1px solid #1a2e47',
  borderRadius: 8, color: '#e2e8f0', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#64748b', marginBottom: 6, letterSpacing: '0.04em',
};

export default function Login({ navigate }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      const redirect = sessionStorage.getItem('redirect_after_auth');
      sessionStorage.removeItem('redirect_after_auth');
      navigate(redirect ?? '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: '#0d1827', border: '1px solid #1a2e47',
        borderRadius: 16, padding: 32,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, margin: '0 auto 12px',
            background: 'linear-gradient(145deg, #d97706, #7c2d12)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 900, color: 'white',
          }}>
            BB
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
            Sign in
          </div>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Byte Boards · Catan AI Arena
          </div>
        </div>

        <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>EMAIL</label>
            <input
              type="email" value={email} required autoComplete="email"
              onChange={e => setEmail(e.target.value)}
              style={fieldStyle}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label style={labelStyle}>PASSWORD</label>
            <input
              type="password" value={password} required autoComplete="current-password"
              onChange={e => setPassword(e.target.value)}
              style={fieldStyle}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              padding: '10px', borderRadius: 8, border: 'none',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? 'rgba(217,119,6,0.1)' : 'linear-gradient(135deg, #d97706, #b45309)',
              color: loading ? '#7c4a00' : 'white',
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#475569' }}>
          No account?{' '}
          <button
            onClick={() => navigate('/register')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#f59e0b', fontWeight: 600, fontSize: 13, padding: 0,
            }}
          >
            Register
          </button>
        </div>
      </div>
    </div>
  );
}
