// Thin HTTP client over the BIRA backend. Keeps auth state in-process so
// MCP tools can `login` once and then call other tools transparently.

export type AuthState = {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string };
};

export class BiraClient {
  private auth: AuthState | null = null;

  constructor(private readonly baseUrl: string) {}

  isAuthed(): boolean {
    return this.auth !== null;
  }

  currentUser(): AuthState['user'] | null {
    return this.auth?.user ?? null;
  }

  setAuth(auth: AuthState): void {
    this.auth = auth;
  }

  clearAuth(): void {
    this.auth = null;
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    opts: { authed?: boolean } = { authed: true }
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.authed !== false) {
      if (!this.auth) {
        throw new Error('Not logged in. Call the `login` tool first.');
      }
      headers.Authorization = `Bearer ${this.auth.token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      // non-JSON response — surface raw text in the error
    }

    if (!res.ok) {
      const message =
        (json as { message?: string } | undefined)?.message ??
        (text || `HTTP ${res.status}`);
      throw new Error(`${method} ${path} → ${res.status}: ${message}`);
    }

    // BIRA convention: { success, data, ... }
    const envelope = json as { data?: T } | undefined;
    return (envelope?.data ?? (json as T)) as T;
  }
}
