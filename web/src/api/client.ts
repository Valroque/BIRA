/**
 * Authenticated fetch wrapper for the BIRA backend.
 *
 * - Reads VITE_API_URL for the base URL.
 * - Attaches the stored Bearer token to every request.
 * - On 401: refreshes the token once and retries.
 * - Unwraps the `{ success, data }` envelope — callers receive `.data` directly.
 * - Throws `ApiError` on non-2xx responses (after refresh retry).
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5001';

const TOKEN_KEY = 'bira:token';
const REFRESH_KEY = 'bira:refresh-token';

// ---------------------------------------------------------------------------
// Token storage helpers
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setTokens(token: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function refreshTokens(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  const res = await fetch(`${BASE_URL}/api/auth/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearTokens();
    return null;
  }

  const json = await res.json();
  const data = json?.data ?? json;
  if (data?.token) {
    setTokens(data.token, data.refreshToken ?? refreshToken);
    return data.token;
  }
  clearTokens();
  return null;
}

// ---------------------------------------------------------------------------
// Main fetch wrapper
// ---------------------------------------------------------------------------

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const doFetch = (t: string | null) =>
    fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
    });

  let res = await doFetch(token);

  // On 401 try to refresh once and retry.
  if (res.status === 401) {
    const newToken = await refreshTokens();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = null; }
    const message =
      (body as { message?: string })?.message ??
      (body as { error?: string })?.error ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  // 204 No Content is a valid 2xx with no body — common for DELETE. Return
  // undefined cast to T so callers that pass `<void>` see no exception.
  if (res.status === 204) {
    return undefined as T;
  }

  const json = await res.json();
  // Unwrap the { success, data } envelope when present.
  return (json?.data !== undefined ? json.data : json) as T;
}
