import type { User } from '../entities/User.js';
import type { Role } from '../lib/constants.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      /**
       * Populated by `tenantScope` middleware after `authenticate`. Available
       * only on routes mounted under `/:tenantSlug` or that go through the
       * tenant-scope chain.
       */
      scope?: {
        tenantId: string;
        tenantSlug: string;
        workspaceId?: string;
        workspaceSlug?: string;
        role: Role;
      };
    }
  }
}

export {};
