import type { User } from '../entities/User.js';
import type { Role, TenantStatus, WorkspaceStatus } from '../lib/constants.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      /**
       * How the request was authenticated. Set by `authenticate`:
       *   - `{ method: 'jwt' }`            — Authorization: Bearer <jwt>
       *   - `{ method: 'pat', tokenId }`   — Authorization: Bearer bira_pat_<…>
       *
       * `req.user` looks identical between the two paths so downstream
       * handlers stay agnostic. The `tokenId` is the row id from
       * `personal_access_tokens` and is only set on the PAT path — it's
       * load-bearing for the `requireJwtAuth` gate (which 403s when a PAT
       * tries to mint another PAT) and for the debounced `last_used_at`
       * write inside the middleware itself.
       */
      auth?: {
        method: 'jwt' | 'pat';
        tokenId?: string;
      };
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
