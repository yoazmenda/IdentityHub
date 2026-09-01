import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getToken, clearToken, USER_CACHE_KEY } from '../api/client';
import * as authApi from '../api/auth';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem(USER_CACHE_KEY);
    return cached ? (JSON.parse(cached) as User) : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If there's no token, whatever user we cached is stale.
    if (!getToken() && user) {
      setUser(null);
      localStorage.removeItem(USER_CACHE_KEY);
    }
  }, [user]);

  function persistUser(u: User) {
    setUser(u);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
  }

  async function login(email: string, password: string) {
    setLoading(true);
    try {
      persistUser(await authApi.login(email, password));
    } finally {
      setLoading(false);
    }
  }

  async function register(email: string, password: string, name: string) {
    setLoading(true);
    try {
      persistUser(await authApi.register(email, password, name));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await authApi.logout();
    clearToken();
    localStorage.removeItem(USER_CACHE_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
