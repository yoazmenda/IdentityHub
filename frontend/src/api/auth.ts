import { api, setToken, clearToken } from './client';
import type { User } from '../types';

interface AuthResponse {
  token: string;
  user: User;
}

export async function login(email: string, password: string): Promise<User> {
  const res = await api.post<AuthResponse>('/api/auth/login', { email, password });
  setToken(res.token);
  return res.user;
}

export async function register(email: string, password: string, name: string): Promise<User> {
  const res = await api.post<AuthResponse>('/api/auth/register', { email, password, name });
  setToken(res.token);
  return res.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post<void>('/api/auth/logout');
  } finally {
    clearToken();
  }
}
