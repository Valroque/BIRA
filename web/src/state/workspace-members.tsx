// Workspace members — runtime state, scoped per (tenant, workspace).
//
// Mounted in `WorkspaceLayout` (App.tsx) with `key={`${tenant}/${workspace}`}`,
// so navigating across pairs reloads the directory cleanly. Open to any
// workspace member; mutations are admin-only on the BE.

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import {
  listWorkspaceMembers as apiListWorkspaceMembers,
  addWorkspaceMember as apiAddWorkspaceMember,
  updateWorkspaceMemberRole as apiUpdateWorkspaceMemberRole,
  removeWorkspaceMember as apiRemoveWorkspaceMember,
} from '../api/workspaceMembers';
import type { WorkspaceMember } from '../api/adapters/workspaceMember.adapter';
import type { Role } from '../fixtures';

export interface WorkspaceMembersCtxValue {
  members: WorkspaceMember[];
  loading: boolean;
  error: string | null;
  /** Lookup by membershipId. */
  getMember: (membershipId: string) => WorkspaceMember | undefined;
  /** Lookup by userId — handy when external code (issue assignee, etc.) only has the user UUID. */
  getMemberByUserId: (userId: string | null | undefined) => WorkspaceMember | undefined;
  /** Re-fetch the directory. Does not toggle `loading`. */
  refresh: () => Promise<void>;
  /** Direct-add a tenant member to this workspace. Throws on failure. */
  invite: (payload: { userId: string; role: Role }) => Promise<WorkspaceMember>;
  /** Patch the role of an existing membership. Throws on failure. */
  setRole: (membershipId: string, role: Role) => Promise<WorkspaceMember>;
  /** Remove a member from this workspace. Throws on failure. */
  remove: (membershipId: string) => Promise<void>;
}

const WorkspaceMembersContext = createContext<WorkspaceMembersCtxValue | undefined>(undefined);

export function WorkspaceMembersProvider({
  tenant, workspace, children,
}: {
  tenant: string; workspace: string; children: ReactNode;
}) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (toggleLoading: boolean) => {
    if (!tenant || !workspace) {
      if (toggleLoading) setLoading(false);
      return;
    }
    if (toggleLoading) setLoading(true);
    try {
      const items = await apiListWorkspaceMembers(tenant, workspace);
      setMembers(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      if (toggleLoading) setLoading(false);
    }
  }, [tenant, workspace]);

  useEffect(() => { void load(true); }, [load]);

  const getMember = useCallback(
    (membershipId: string) => members.find((m) => m.membershipId === membershipId),
    [members],
  );

  const getMemberByUserId = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return undefined;
      return members.find((m) => m.userId === userId);
    },
    [members],
  );

  const refresh = useCallback(() => load(false), [load]);

  const invite = useCallback(async (payload: { userId: string; role: Role }) => {
    const created = await apiAddWorkspaceMember(tenant, workspace, payload);
    setMembers((prev) => {
      // Replace if a row with the same membershipId already exists; else append.
      const idx = prev.findIndex((m) => m.membershipId === created.membershipId);
      if (idx === -1) return [...prev, created];
      const copy = [...prev];
      copy[idx] = created;
      return copy;
    });
    return created;
  }, [tenant, workspace]);

  const setRole = useCallback(async (membershipId: string, role: Role) => {
    const updated = await apiUpdateWorkspaceMemberRole(tenant, workspace, membershipId, role);
    setMembers((prev) => prev.map((m) => (m.membershipId === membershipId ? updated : m)));
    return updated;
  }, [tenant, workspace]);

  const remove = useCallback(async (membershipId: string) => {
    await apiRemoveWorkspaceMember(tenant, workspace, membershipId);
    setMembers((prev) => prev.filter((m) => m.membershipId !== membershipId));
  }, [tenant, workspace]);

  const value: WorkspaceMembersCtxValue = {
    members, loading, error,
    getMember, getMemberByUserId, refresh,
    invite, setRole, remove,
  };

  return (
    <WorkspaceMembersContext.Provider value={value}>
      {children}
    </WorkspaceMembersContext.Provider>
  );
}

export function useWorkspaceMembers(): WorkspaceMembersCtxValue {
  const ctx = useContext(WorkspaceMembersContext);
  if (!ctx) throw new Error('useWorkspaceMembers must be used within WorkspaceMembersProvider');
  return ctx;
}
