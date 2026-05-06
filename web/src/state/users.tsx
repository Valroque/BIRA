// Workspace user roster — UUID-keyed lookups for resolving issue
// `assigneeUserId` / comment author / mention targets to a display name.
//
// Slice 13 (2026-05-06) flipped this provider from the `TENANT_MEMBERS`
// fixture to the BE. Source endpoint is
// `GET /api/tenants/:t/workspaces/:w/members` — verified against
// `server/src/routes/workspaceMembers.ts`. There is no tenant-wide member
// list endpoint on the BE today (the closest is the workspace one), so the
// provider stays workspace-scoped: it remounts on every workspace switch
// rather than caching tenant-wide. The consumer-facing API
// (`users` / `getUser` / `searchUsers` / `UNKNOWN_USER_LABEL`) is unchanged
// so the dozen-plus consumers don't have to be touched.
//
// **Design call**: UUIDs are identity, never display. When `getUser(id)`
// returns undefined, callers must render a placeholder
// (`UNKNOWN_USER_LABEL`) — never the raw uuid. See
// `project_uuid_identity_in_fe.md`.

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { getTenantUser, listWorkspaceUsers } from '../api/users';
import { ApiError } from '../api/client';
import type { WorkspaceUser } from '../api/adapters/user.adapter';

// Re-export so existing `import { type WorkspaceUser } from '.../state/users'`
// callers keep compiling — the adapter is now the canonical source of the type.
export type { WorkspaceUser };

export interface UsersCtxValue {
  /** Active members of this workspace. Deactivated users are filtered out. */
  users: WorkspaceUser[];
  /** True only during the initial fetch. Subsequent `refresh()` calls don't toggle this. */
  loading: boolean;
  /** Human-readable error message from the last fetch, or null. */
  error: string | null;
  /** Lookup by UUID. Returns undefined for unknown ids — callers must show a placeholder, not the uuid. */
  getUser: (id: string | null | undefined) => WorkspaceUser | undefined;
  /** Substring search over name + email; capped at 8 hits. Empty query → first 8 users. */
  searchUsers: (q: string) => WorkspaceUser[];
  /** Re-fetch the directory. Does not toggle `loading`. */
  refresh: () => Promise<void>;
  /**
   * Fire-and-forget tenant-scoped fetch for a single uuid not in the
   * workspace directory (e.g. a former workspace member who authored a
   * comment). No-op if the uuid is already cached, already known-unknown
   * (404'd before), or already in-flight. On success the user is added
   * to the cache and consumers re-render. Prefer `useResolvedUser` over
   * calling this directly.
   */
  resolveUser: (id: string) => void;
}

const UsersContext = createContext<UsersCtxValue | undefined>(undefined);

export function UsersProvider({
  tenant, workspace, children,
}: { tenant: string; workspace: string; children: ReactNode }) {
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mirror `users` into a ref so `resolveUser`'s cache check can read the
  // latest value without depending on `users` (which would re-create the
  // callback on every fetch and re-fire consumer effects).
  const usersRef = useRef<WorkspaceUser[]>([]);
  useEffect(() => { usersRef.current = users; }, [users]);

  // Track in-flight + known-unknown uuids. Refs (not state) — these are
  // pure dedupe metadata, not render-affecting.
  const inflightRef = useRef<Set<string>>(new Set());
  const unknownRef = useRef<Set<string>>(new Set());

  // Reset dedupe state when the workspace context changes — the new
  // tenant might have different membership.
  useEffect(() => {
    inflightRef.current = new Set();
    unknownRef.current = new Set();
  }, [tenant, workspace]);

  const load = useCallback(async (toggleLoading: boolean) => {
    if (!tenant || !workspace) {
      if (toggleLoading) setLoading(false);
      return;
    }
    if (toggleLoading) setLoading(true);
    try {
      const items = await listWorkspaceUsers(tenant, workspace);
      setUsers(items);
      setError(null);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message :
        err instanceof Error ? err.message :
        'Failed to load users';
      setError(msg);
    } finally {
      if (toggleLoading) setLoading(false);
    }
  }, [tenant, workspace]);

  useEffect(() => { void load(true); }, [load]);

  const getUser = useCallback(
    (id: string | null | undefined) => {
      if (!id) return undefined;
      return users.find((u) => u.id === id);
    },
    [users],
  );

  const searchUsers = useCallback(
    (q: string): WorkspaceUser[] => {
      const needle = q.trim().toLowerCase();
      if (!needle) return users.slice(0, 8);
      return users
        .filter((u) =>
          u.displayName.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle),
        )
        .slice(0, 8);
    },
    [users],
  );

  const refresh = useCallback(() => load(false), [load]);

  const resolveUser = useCallback((id: string) => {
    if (!id || !tenant) return;
    if (usersRef.current.some((u) => u.id === id)) return;
    if (unknownRef.current.has(id)) return;
    if (inflightRef.current.has(id)) return;
    inflightRef.current.add(id);
    void getTenantUser(tenant, id)
      .then((u) => {
        // Setter checks again before insert — guards against a parallel
        // workspace-list fetch that landed first.
        setUsers((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]));
      })
      .catch((err) => {
        // 404 is the load-bearing case — the user was never a tenant
        // member, cache the negative so we don't keep retrying.
        if (err instanceof ApiError && err.status === 404) {
          unknownRef.current.add(id);
        }
        // Other errors (network, 5xx) are intentionally NOT cached as
        // unknown — they're plausibly transient and the caller may try
        // again on a later interaction.
      })
      .finally(() => {
        inflightRef.current.delete(id);
      });
  }, [tenant]);

  const value: UsersCtxValue = {
    users, loading, error, getUser, searchUsers, refresh, resolveUser,
  };

  return <UsersContext.Provider value={value}>{children}</UsersContext.Provider>;
}

export function useUsers(): UsersCtxValue {
  const ctx = useContext(UsersContext);
  if (!ctx) throw new Error('useUsers must be used within UsersProvider');
  return ctx;
}

/** Display fallback for missing or null user references. */
export const UNKNOWN_USER_LABEL = 'Unknown user';

/**
 * Resolve a uuid to a `WorkspaceUser`, with automatic fallback fetch.
 *
 * Returns synchronously from cache; if the uuid isn't there, fires a
 * tenant-scoped fetch (deduped + known-unknown-cached at the provider) and
 * the consuming component re-renders when the cache populates. Use this
 * over raw `getUser(id)` anywhere a uuid might come from a source outside
 * the current workspace's directory — comment authors, audit log entries,
 * mention targets in historical content.
 */
export function useResolvedUser(userId: string | null | undefined) {
  const { getUser, resolveUser } = useUsers();
  useEffect(() => {
    if (userId) resolveUser(userId);
  }, [userId, resolveUser]);
  return getUser(userId);
}
