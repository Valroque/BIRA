import { hashPassword } from '../../src/lib/passwordUtils.js';
import * as userService from '../../src/services/userService.js';
import * as tenantService from '../../src/services/tenantService.js';
import * as workspaceService from '../../src/services/workspaceService.js';
import * as projectService from '../../src/services/projectService.js';
import * as membershipService from '../../src/services/membershipService.js';
import { login as loginUseCase } from '../../src/usecases/auth/login.js';
import type { User } from '../../src/entities/User.js';
import type { Tenant } from '../../src/entities/Tenant.js';
import type { Workspace } from '../../src/entities/Workspace.js';
import type { Project } from '../../src/entities/Project.js';
import type { Role, WorkspaceStatus } from '../../src/lib/constants.js';

/**
 * Test factories. EVERY helper goes through a service or usecase — never
 * raw `knex(...).insert()` — so the tests stay honest about the app's
 * invariants (validators, password hashing, mustResetPassword wiring,
 * etc.).
 */

let counter = 0;
function uniq(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

export interface CreateUserOpts {
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  mustReset?: boolean;
  phone?: string | null;
}

export interface CreateUserResult {
  user: User;
  password: string;
}

export async function createUser(opts: CreateUserOpts = {}): Promise<CreateUserResult> {
  const tag = uniq();
  const email = opts.email ?? `user-${tag}@test.local`;
  const firstName = opts.firstName ?? 'Test';
  const lastName = opts.lastName ?? `User${tag}`;
  const password = opts.password ?? 'password123';
  const phone = opts.phone === undefined ? null : opts.phone;

  const passwordHash = await hashPassword(password);
  const created = await userService.create({
    email,
    passwordHash,
    firstName,
    lastName,
  });

  // Phone isn't on the create() input shape — apply it via update() so
  // the path mirrors what the app does.
  if (phone !== null) {
    await userService.update(created.id, { phone });
  }

  // mustReset is set via setPassword() so we don't bypass the service —
  // we re-hash the same password to keep the test login path working.
  if (opts.mustReset) {
    const mustResetHash = await hashPassword(password);
    await userService.setPassword(created.id, mustResetHash, { mustReset: true });
  }

  const final = await userService.getById(created.id);
  if (!final) throw new Error('createUser: failed to re-fetch user');
  return { user: final, password };
}

export interface CreateTenantOpts {
  slug?: string;
  name?: string;
}

export async function createTenant(opts: CreateTenantOpts = {}): Promise<Tenant> {
  const tag = uniq();
  return tenantService.create({
    slug: opts.slug ?? `tenant-${tag}`,
    name: opts.name ?? `Tenant ${tag}`,
    letter: 'T',
    color: '#4f46e5',
    bg: '#e0e7ff',
  });
}

export async function addTenantMember(
  userId: string,
  tenantId: string,
  role: Role
): Promise<void> {
  await membershipService.addTenantMember({ userId, tenantId, role, status: 'active' });
}

export interface LoginResult {
  token: string;
  refreshToken: string;
  user: User;
}

/**
 * Authenticate a user via the real login usecase and return the access
 * token. Intentionally does NOT hit the HTTP route — we want the access
 * token even for users who are gated by other middleware.
 */
export async function loginAs(email: string, password: string): Promise<LoginResult> {
  const result = await loginUseCase({ email, password });
  return {
    token: result.token,
    refreshToken: result.refreshToken,
    user: result.user,
  };
}

// ── Workspace factories ───────────────────────────────────────────────────

export interface CreateWorkspaceOpts {
  tenantId: string;
  slug?: string;
  name?: string;
  status?: WorkspaceStatus;
}

export async function createWorkspace(opts: CreateWorkspaceOpts): Promise<Workspace> {
  const tag = uniq();
  const ws = await workspaceService.create({
    tenantId: opts.tenantId,
    slug: opts.slug ?? `ws-${tag}`,
    name: opts.name ?? `Workspace ${tag}`,
    letter: 'W',
    color: '#4f46e5',
    bg: '#e0e7ff',
  });
  if (opts.status && opts.status !== 'active') {
    const updated = await workspaceService.setStatus(ws.id, opts.status);
    if (!updated) throw new Error('createWorkspace: failed to set status');
    return updated;
  }
  return ws;
}

export async function addWorkspaceMember(
  userId: string,
  workspaceId: string,
  role: Role
): Promise<void> {
  await membershipService.addWorkspaceMember({ userId, workspaceId, role });
}

// ── Project factories ─────────────────────────────────────────────────────

export interface CreateProjectOpts {
  workspaceId: string;
  createdByUserId: string;
  slug?: string;
  key?: string;
  name?: string;
}

export async function createProject(opts: CreateProjectOpts): Promise<Project> {
  const tag = uniq();
  // Use counter directly — timestamp can repeat within the same ms, but counter is always unique.
  const autoKey = `P${counter}`;
  return projectService.create({
    workspaceId: opts.workspaceId,
    slug: opts.slug ?? `proj-${tag}`,
    key: opts.key ?? autoKey,
    name: opts.name ?? `Project ${tag}`,
    letter: 'P',
    color: '#0891b2',
    bg: '#cffafe',
    createdByUserId: opts.createdByUserId,
  });
}
