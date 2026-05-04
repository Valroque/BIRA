import type { User } from '../entities/User.js';
import type { Role, TenantStatus, WorkspaceStatus } from '../lib/constants.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      /**
       * Populated by `tenantScope` middleware after `authenticate`. Available
       * only on routes mounted under `/:tenantSlug` or that go through the
       * tenant-scope chain.
       *
       * After `resolveTenantScope`: `role` is the user's tenant role.
       * After `resolveWorkspaceScope`: `role` is the effective workspace
       * role (tenant-admin-wins), and `workspaceStatus` reflects the
       * workspace's current archive state. `tenantRole` is preserved so
       * routes that need the original tenant role (e.g. tenant-admin-only
       * archive ops) can still consult it after workspace scope resolves.
       */
      scope?: {
        tenantId: string;
        tenantSlug: string;
        tenantRole: Role;
        tenantStatus: TenantStatus;
        workspaceId?: string;
        workspaceSlug?: string;
        workspaceStatus?: WorkspaceStatus;
        role: Role;
      };
    }
  }
}

export {};
