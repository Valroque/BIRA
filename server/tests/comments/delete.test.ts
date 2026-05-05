import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  createProject,
  createIssue,
  createCommentFactory,
  createFile,
  loginAs,
} from '../helpers/factories.js';
import { buildAttachmentRef } from '../../src/lib/attachmentRefs.js';

async function setup() {
  const user = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  await addWorkspaceMember(user.user.id, ws.id, 'admin');
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.user.id,
    key: 'DEL',
  });
  const issue = await createIssue({
    workspaceId: ws.id,
    projectId: proj.id,
    reporterUserId: user.user.id,
    type: 'T',
  });
  const { token } = await loginAs(user.user.email, user.password);
  return { user, tenant, ws, proj, issue, token };
}

function commentUrl(tenantSlug: string, wsSlug: string, commentId: string) {
  return `/api/tenants/${tenantSlug}/workspaces/${wsSlug}/comments/${commentId}`;
}

describe('DELETE …/workspaces/:w/comments/:commentId', () => {
  it('204 author can delete their own comment and row is gone', async () => {
    const { user, tenant, ws, issue, token } = await setup();
    const comment = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
      body: 'Delete me',
    });

    const res = await api()
      .delete(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    // Confirm the comment is gone via a second DELETE (should 404).
    const check = await api()
      .delete(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${token}`);
    expect(check.status).toBe(404);
  });

  it('204 admin can delete another user\'s comment', async () => {
    const { tenant, ws, issue } = await setup();

    const author = await createUser();
    await addTenantMember(author.user.id, tenant.id, 'write');
    await addWorkspaceMember(author.user.id, ws.id, 'write');
    const comment = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: author.user.id,
      body: 'Admin will delete this',
    });

    const admin = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addWorkspaceMember(admin.user.id, ws.id, 'admin');
    const { token: adminToken } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .delete(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('403 non-author non-admin cannot delete', async () => {
    const { user, tenant, ws, issue } = await setup();
    const comment = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
      body: 'Private comment',
    });

    const other = await createUser();
    await addTenantMember(other.user.id, tenant.id, 'write');
    await addWorkspaceMember(other.user.id, ws.id, 'write');
    const { token: otherToken } = await loginAs(other.user.email, other.password);

    const res = await api()
      .delete(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });

  it('referenced files are NOT deleted when comment is deleted', async () => {
    const { user, tenant, ws, issue, token } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    const comment = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
      body: 'Has attachment',
      attachmentIds: [ref],
    });

    await api()
      .delete(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${token}`);

    // The file should still be downloadable.
    const fileRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/files/${file.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(fileRes.status).toBe(200);
  });

  it('404 when comment id does not exist', async () => {
    const { tenant, ws, token } = await setup();
    const res = await api()
      .delete(commentUrl(tenant.slug, ws.slug, '00000000-0000-0000-0000-000000000000'))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('404 when comment belongs to a different workspace', async () => {
    const { user, tenant, ws, issue, token } = await setup();

    // Create a second workspace with its own comment.
    const ws2 = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.user.id, ws2.id, 'admin');
    const proj2 = await createProject({
      workspaceId: ws2.id,
      createdByUserId: user.user.id,
      key: 'OTH',
    });
    const issue2 = await createIssue({
      workspaceId: ws2.id,
      projectId: proj2.id,
      reporterUserId: user.user.id,
      type: 'T',
    });
    const otherComment = await createCommentFactory({
      workspaceId: ws2.id,
      tenantId: tenant.id,
      issueId: issue2.id,
      authorUserId: user.user.id,
      body: 'In other workspace',
    });

    // Try to delete the other-workspace comment via the first workspace's URL.
    const res = await api()
      .delete(commentUrl(tenant.slug, ws.slug, otherComment.id))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);

    // Suppress unused var warning
    void issue;
  });
});
