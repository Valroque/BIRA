import * as membershipService from '../../services/membershipService.js';
import type { TenantMemberView } from '../../services/membershipService.js';

export async function listTenantMembers(input: {
  tenantId: string;
}): Promise<TenantMemberView[]> {
  return membershipService.listTenantMembers(input.tenantId);
}
