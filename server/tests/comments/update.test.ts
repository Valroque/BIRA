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
    key: 'UPD',
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

describe('PATCH …/workspaces/:w/comments/:commentId', () => {
  it('200 author can edit body', async () => {
    const { user, tenant, ws, issue, token } = await setup();
    const comment = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
      body: 'Original body',
    });

    const res = await api()
      .patch(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Updated body' });

    expect(res.status).toBe(200);
    expect(res.body.data.body).toBe('Updated body');
    expect(res.body.data.updatedAt).toBeTruthy();
  });

  it('200 admin can edit another user\'s comment', async () => {
    const { tenant, ws, issue } = await setup();

    // Create a non-admin author.
    const author = await createUser();
    await addTenantMember(author.user.id, tenant.id, 'write');
    await addWorkspaceMember(author.user.id, ws.id, 'write');
    const comment = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: author.user.id,
      body: 'Author wrote this',
    });

    // Admin edits it.
    const admin = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addWorkspaceMember(admin.user.id, ws.id, 'admin');
    const { token: adminToken } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .patch(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'Admin edited this' });

    expect(res.status).toBe(200);
    expect(res.body.data.body).toBe('Admin edited this');
  });

  it('403 non-author non-admin cannot edit', async () => {
    const { user, tenant, ws, issue } = await setup();
    const comment = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
      body: 'Owner only',
    });

    const other = await createUser();
    await addTenantMember(other.user.id, tenant.id, 'write');
    await addWorkspaceMember(other.user.id, ws.id, 'write');
    const { token: otherToken } = await loginAs(other.user.email, other.password);

    const res = await api()
      .patch(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ body: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('200 update attachmentIds to new set', async () => {
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
      body: 'No attachments yet',
    });

    const res = await api()
      .patch(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ attachmentIds: [ref] });

    expect(res.status).toBe(200);
    expect(res.body.data.attachmentIds).toEqual([ref]);
    expect(res.body.data.attachments).toHaveLength(1);
    expect(res.body.data.attachments[0].id).toBe(file.id);
  });

  it('400 when neither body nor attachmentIds is provided', async () => {
    const { user, tenant, ws, issue, token } = await setup();
    const comment = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
    });

    const res = await api()
      .patch(commentUrl(tenant.slug, ws.slug, comment.id))
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('404 when comment id does not exist in this workspace', async () => {
    const { tenant, ws, token } = await setup();
    const res = await api()
      .patch(commentUrl(tenant.slug, ws.slug, '00000000-0000-0000-0000-000000000000'))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Ghost' });
    expect(res.status).toBe(404);
  });
});
