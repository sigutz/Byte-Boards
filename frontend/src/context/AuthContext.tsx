import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { API_BASE, setActiveToken } from '../types';

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'bb_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!token) { setActiveToken(null); setUser(null); return; }
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? (r.json() as Promise<AuthUser>) : Promise.reject())
      .then(u => { setActiveToken(token); setUser(u); })
      .catch(() => { setActiveToken(null); localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null); });
  }, [token]);

  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? 'Login failed');
    }
    const { token: t, user: u } = await res.json() as { token: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, t);
    setActiveToken(t);
    setToken(t);
    setUser(u);
  }

  async function register(email: string, password: string, name?: string) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? 'Registration failed');
    }
    const { token: t, user: u } = await res.json() as { token: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, t);
    setActiveToken(t);
    setToken(t);
    setUser(u);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setActiveToken(null);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAdmin: user?.role === 'ADMIN',
      login,
      register,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
