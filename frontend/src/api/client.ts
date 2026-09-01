import type { ApiError } from '../types';

const TOKEN_KEY = 'identityhub_token';
export const USER_CACHE_KEY = 'identityhub_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Clears the whole client-side session (token + cached user) and sends the browser to /login —
 * used when an authenticated request comes back 401, meaning the server-side session is dead
 * (expired JWT, logged out elsewhere, revoked). A hard navigation, not client-side routing,
 * because this runs outside any React context and must work no matter what page is open. */
function endSession(): void {
  clearToken();
  localStorage.removeItem(USER_CACHE_KEY);
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

/** Thrown for every non-2xx response. Carries the parsed {error, details?} body from the API. */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.error);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

/** Thin typed fetch wrapper — every API call in the app goes through here, never raw fetch(). */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : undefined;

  if (!res.ok) {
    // Only a *dead session* (this request carried a token and still got 401) forces a redirect —
    // a login/register attempt 401s with no token attached and should surface inline instead.
    if (res.status === 401 && token) endSession();
    throw new ApiRequestError(res.status, data ?? { error: 'Request failed' });
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
