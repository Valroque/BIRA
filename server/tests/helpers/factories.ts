import { hashPassword } from '../../src/lib/passwordUtils.js';
import * as userService from '../../src/services/userService.js';
import * as tenantService from '../../src/services/tenantService.js';
import * as workspaceService from '../../src/services/workspaceService.js';
import * as projectService from '../../src/services/projectService.js';
import * as teamService from '../../src/services/teamService.js';
import * as membershipService from '../../src/services/membershipService.js';
import { login as loginUseCase } from '../../src/usecases/auth/login.js';
import { createIssue as createIssueUseCase } from '../../src/usecases/issues/createIssue.js';
import { uploadFile as uploadFileUseCase } from '../../src/usecases/files/uploadFile.js';
import { createComment as createCommentUseCase } from '../../src/usecases/comments/createComment.js';
import { createMilestone as createMilestoneUseCase } from '../../src/usecases/milestones/createMilestone.js';
import type { User } from '../../src/entities/User.js';
import type { Tenant } from '../../src/entities/Tenant.js';
import type { Workspace } from '../../src/entities/Workspace.js';
import type { Project } from '../../src/entities/Project.js';
import type { Team } from '../../src/entities/Team.js';
import type { Issue } from '../../src/entities/Issue.js';
import type { File } from '../../src/entities/File.js';
import type { Comment } from '../../src/entities/Comment.js';
import type { Milestone } from '../../src/entities/Milestone.js';
import type {
  Role,
  WorkspaceStatus,
  ProjectStatus,
  IssueType,
  StatusId,
  Priority,
} from '../../src/lib/constants.js';

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
  status?: ProjectStatus;
}

export async function createProject(opts: CreateProjectOpts): Promise<Project> {
  const tag = uniq();
  // Use counter directly — timestamp can repeat within the same ms, but counter is always unique.
  const autoKey = `P${counter}`;
  const project = await projectService.create({
    workspaceId: opts.workspaceId,
    slug: opts.slug ?? `proj-${tag}`,
    key: opts.key ?? autoKey,
    name: opts.name ?? `Project ${tag}`,
    letter: 'P',
    color: '#0891b2',
    bg: '#cffafe',
    createdByUserId: opts.createdByUserId,
  });
  if (opts.status && opts.status !== 'active') {
    const updated = await projectService.setStatus(project.id, opts.status);
    if (!updated) throw new Error('createProject: failed to set status');
    return updated;
  }
  return project;
}

// ── Team factories ────────────────────────────────────────────────────────

export interface CreateTeamOpts {
  workspaceId: string;
  createdByUserId: string;
  slug?: string;
  name?: string;
  description?: string;
  color?: string;
}

export async function createTeam(opts: CreateTeamOpts): Promise<Team> {
  const tag = uniq();
  return teamService.create({
    workspaceId: opts.workspaceId,
    slug: opts.slug ?? `team-${tag}`,
    name: opts.name ?? `Team ${tag}`,
    description: opts.description ?? '',
    color: opts.color ?? '#6366f1',
    createdByUserId: opts.createdByUserId,
  });
}

// ── Issue factories ───────────────────────────────────────────────────────

export interface CreateIssueOpts {
  workspaceId: string;
  projectId: string;
  reporterUserId: string;
  type?: IssueType;
  title?: string;
  description?: string | null;
  status?: StatusId;
  priority?: Priority;
  labels?: string[];
  assigneeUserId?: string | null;
  // Slice 1 (Team-on-Issue) — optional team uuid; mutually exclusive
  // with assigneeUserId at the usecase layer.
  teamId?: string | null;
  // Optional parent — accepts a uuid directly. Tests that need to
  // create a Story must pass an Epic's id here (Story-without-parent
  // is rejected by the usecase). Tasks/Bugs may omit it.
  parentIssueId?: string | null;
}

export async function createIssue(opts: CreateIssueOpts): Promise<Issue> {
  const tag = uniq();
  return createIssueUseCase({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    reporterUserId: opts.reporterUserId,
    type: opts.type ?? 'T',
    title: opts.title ?? `Issue ${tag}`,
    description: opts.description,
    status: opts.status,
    priority: opts.priority,
    labels: opts.labels,
    assigneeUserId: opts.assigneeUserId,
    teamId: opts.teamId,
    parentIssueId: opts.parentIssueId,
  });
}

// ── File factories ────────────────────────────────────────────────────────

export interface CreateFileOpts {
  tenantId: string;
  workspaceId: string;
  uploaderUserId: string;
  mime?: string;
  filename?: string;
  bytes?: Buffer;
}

/**
 * Creates a file by calling the real uploadFile usecase.
 * Defaults to a minimal PNG-like buffer so tests don't need to supply bytes.
 */
export async function createFile(opts: CreateFileOpts): Promise<File> {
  return uploadFileUseCase({
    tenantId: opts.tenantId,
    workspaceId: opts.workspaceId,
    uploaderUserId: opts.uploaderUserId,
    mime: opts.mime ?? 'image/png',
    filename: opts.filename ?? 'test.png',
    bytes: opts.bytes ?? Buffer.from('fakepng'),
  });
}

// ── Comment factories ─────────────────────────────────────────────────────

export interface CreateCommentFactoryOpts {
  workspaceId: string;
  tenantId: string;
  issueId: string;
  authorUserId: string;
  body?: string;
  attachmentIds?: string[];
}

/**
 * Creates a comment by calling the real createComment usecase.
 */
export async function createCommentFactory(opts: CreateCommentFactoryOpts): Promise<Comment> {
  const tag = uniq();
  return createCommentUseCase({
    workspaceId: opts.workspaceId,
    tenantId: opts.tenantId,
    issueId: opts.issueId,
    authorUserId: opts.authorUserId,
    body: opts.body ?? `Comment ${tag}`,
    attachmentIds: opts.attachmentIds,
  });
}

// ── Milestone factories ───────────────────────────────────────────────────

export interface CreateMilestoneFactoryOpts {
  workspaceId: string;
  projectId: string;
  name?: string;
  description?: string | null;
  date?: string;
}

/**
 * Creates a milestone by calling the real createMilestone usecase.
 * Defaults `date` to a future-but-stable string so seeded milestones don't
 * accidentally count as "overdue" in any FE assertions that creep in here.
 */
export async function createMilestone(opts: CreateMilestoneFactoryOpts): Promise<Milestone> {
  const tag = uniq();
  return createMilestoneUseCase({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    name: opts.name ?? `Milestone ${tag}`,
    description: opts.description,
    date: opts.date ?? '2030-01-01',
  });
}
