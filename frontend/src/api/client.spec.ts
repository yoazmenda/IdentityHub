import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, getToken, setToken, USER_CACHE_KEY } from './client';

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let assignMock: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // jsdom's window.location.assign can't be spied on directly (not configurable) — replace
    // the whole object with a stub that keeps pathname but makes assign observable.
    assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, pathname: '/findings', assign: assignMock },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  function jsonResponse(status: number, body: unknown) {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
    };
  }

  it('a 401 on an authenticated request ends the session: clears the token, the cached user, and redirects to /login', async () => {
    setToken('stale-jwt');
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ id: 'u1', name: 'John', email: 'john@acme.com' }));
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Invalid or expired token' }));

    await expect(api.get('/api/findings')).rejects.toThrow();

    expect(getToken()).toBeNull();
    expect(localStorage.getItem(USER_CACHE_KEY)).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
  });

  it('a 401 with no token attached (e.g. a failed login) surfaces inline and does not redirect', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Invalid email or password' }));

    await expect(api.post('/api/auth/login', { email: 'x', password: 'wrong' })).rejects.toThrow(
      'Invalid email or password',
    );

    expect(assignMock).not.toHaveBeenCalled();
  });

  it('a non-401 error does not clear the session', async () => {
    setToken('valid-jwt');
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Internal server error' }));

    await expect(api.get('/api/findings')).rejects.toThrow();

    expect(getToken()).toBe('valid-jwt');
    expect(assignMock).not.toHaveBeenCalled();
  });
});
