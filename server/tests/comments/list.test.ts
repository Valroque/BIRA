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
    key: 'LST',
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

function commentsUrl(tenantSlug: string, wsSlug: string, projSlug: string, issueKey: string) {
  return `/api/tenants/${tenantSlug}/workspaces/${wsSlug}/projects/${projSlug}/issues/${issueKey}/comments`;
}

describe('GET …/issues/:key/comments', () => {
  it('200 returns empty array when issue has no comments', async () => {
    const { tenant, ws, proj, issue, token } = await setup();
    const res = await api()
      .get(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('200 returns comments in createdAt ASC order', async () => {
    const { tenant, ws, proj, issue, token, user } = await setup();
    const c1 = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
      body: 'First comment',
    });
    const c2 = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
      body: 'Second comment',
    });

    const res = await api()
      .get(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe(c1.id);
    expect(res.body.data[1].id).toBe(c2.id);
    expect(res.body.data[0].body).toBe('First comment');
  });

  it('expands valid attachment ref to FileView in attachments[]', async () => {
    const { tenant, ws, proj, issue, token, user } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
      body: 'With attachment',
      attachmentIds: [ref],
    });

    const res = await api()
      .get(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].attachmentIds).toEqual([ref]);
    expect(res.body.data[0].attachments).toHaveLength(1);
    expect(res.body.data[0].attachments[0].id).toBe(file.id);
    expect(res.body.data[0].attachments[0].readUrl).toBeTruthy();
  });

  it('silently drops dangling attachment ref from attachments[]', async () => {
    const { tenant, ws, proj, issue, token, user } = await setup();

    // Create a real file, attach it to a comment, then delete the file to
    // simulate a dangling ref (file was deleted after the comment was created).
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: issue.id,
      authorUserId: user.user.id,
      body: 'Dangling ref after delete',
      attachmentIds: [ref],
    });

    // Now delete the file — simulates a dangling ref going forward.
    await api()
      .delete(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/files/${file.id}`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .get(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Raw ref is preserved…
    expect(res.body.data[0].attachmentIds).toEqual([ref]);
    // …but attachments[] is empty because the file no longer exists.
    expect(res.body.data[0].attachments).toEqual([]);
  });

  it('404 when issue key does not exist in this workspace', async () => {
    const { tenant, ws, proj, token } = await setup();
    const res = await api()
      .get(commentsUrl(tenant.slug, ws.slug, proj.slug, 'LST-9999'))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
