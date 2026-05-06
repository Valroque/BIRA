// Tenant-member API.
//
// BE catalogue (verified — see `server/src/routes/tenantMembers.ts`):
//
//   GET    /api/tenants/:t/members
//   GET    /api/tenants/:t/members/:userId
//   POST   /api/tenants/:t/members/:userId/reset-password
//   POST   /api/tenants/:t/members/:userId/deactivate
//   POST   /api/tenants/:t/members/:userId/reactivate
//
// Only the directory-list is wrapped here. Per-user mutations
// (reset-password, deactivate, reactivate) live in `api/userAdmin.ts`
// next to the workspace-members reuse of the same endpoints.

import { apiFetch } from './client';
import {
  adaptTenantMember,
  type RawTenantMember,
  type TenantMember,
} from './adapters/tenantMember.adapter';

const base = (tenantSlug: string) => `/api/tenants/${tenantSlug}/members`;

export async function listTenantMembers(
  tenantSlug: string,
): Promise<TenantMember[]> {
  const items = await apiFetch<RawTenantMember[]>(base(tenantSlug));
  return items.map(adaptTenantMember);
}
