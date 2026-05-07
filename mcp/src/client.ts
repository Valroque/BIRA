// Thin HTTP client over the BIRA backend. Keeps auth state in-process so
// MCP tools can `login` once and then call other tools transparently.
//
// Bearer resolution priority on every authed request:
//   1. In-process JWT set via `setAuth(...)` (i.e. the `login` tool ran).
//   2. `BIRA_API_TOKEN` env var (a PAT, recommended for production agents).
//   3. None → throw "not authenticated".
//
// `clearAuth()` (used by `logout`) only drops the in-process JWT — the env
// token survives, so a config-driven session isn't accidentally locked out
// when the user calls `logout`.

export type AuthState = {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string };
};

export class BiraClient {
  private auth: AuthState | null = null;
  // Captured once at construction. The env doesn't change at runtime, and
  // reading it here keeps the resolution path obvious — no later mutation,
  // no race with `setAuth`. NEVER log this value.
  private readonly envToken: string | null;

  constructor(private readonly baseUrl: string) {
    const fromEnv = process.env.BIRA_API_TOKEN;
    this.envToken = fromEnv && fromEnv.length > 0 ? fromEnv : null;
  }

  isAuthed(): boolean {
    return this.auth !== null || this.envToken !== null;
  }

  /**
   * Returns the locally-cached user from a `login` call. When the only
   * credential is an env-token, this returns null until a `whoami`-style
   * call hydrates it on the LLM side — the MCP process intentionally
   * doesn't fetch the profile eagerly because we don't want a network
   * round-trip on boot just to know who owns the PAT.
   */
  currentUser(): AuthState['user'] | null {
    return this.auth?.user ?? null;
  }

  setAuth(auth: AuthState): void {
    this.auth = auth;
  }

  /**
   * Drops the in-process JWT only. The env-token (if any) remains as the
   * fallback Bearer so `logout` doesn't lock a config-driven session out
   * of every subsequent tool call.
   */
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
      // Resolve the Bearer in priority order: in-process JWT > env PAT.
      const bearer = this.auth?.token ?? this.envToken;
      if (!bearer) {
        throw new Error(
          'Not authenticated. Either set BIRA_API_TOKEN in env (recommended for production agents) or call the `login` tool with email + password (dev only).'
        );
      }
      headers.Authorization = `Bearer ${bearer}`;
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
