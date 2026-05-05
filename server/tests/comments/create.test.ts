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
    key: 'CRT',
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

describe('POST …/issues/:key/comments', () => {
  it('201 happy path: body only, no attachments', async () => {
    const { tenant, ws, proj, issue, token } = await setup();
    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'A plain comment' });

    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data.id).toBeTruthy();
    expect(data.body).toBe('A plain comment');
    expect(data.attachmentIds).toEqual([]);
    expect(data.attachments).toEqual([]);
    expect(data.issueId).toBe(issue.id);
    expect(data.authorUserId).toBeTruthy();
    expect(data.createdAt).toBeTruthy();
  });

  it('201 happy path: body + valid attachmentIds', async () => {
    const { tenant, ws, proj, issue, token, user } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Comment with attachment', attachmentIds: [ref] });

    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data.attachmentIds).toEqual([ref]);
    expect(data.attachments).toHaveLength(1);
    expect(data.attachments[0].id).toBe(file.id);
    expect(data.attachments[0].readUrl).toBeTruthy();
  });

  it('400 when body is empty string', async () => {
    const { tenant, ws, proj, issue, token } = await setup();
    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: '' });
    expect(res.status).toBe(400);
  });

  it('400 when body is missing', async () => {
    const { tenant, ws, proj, issue, token } = await setup();
    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`)
      .send({ attachmentIds: [] });
    expect(res.status).toBe(400);
  });

  it('400 when body exceeds 50,000 characters', async () => {
    const { tenant, ws, proj, issue, token } = await setup();
    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'x'.repeat(50_001) });
    expect(res.status).toBe(400);
  });

  it('400 when more than 10 attachment refs provided', async () => {
    const { tenant, ws, proj, issue, token, user } = await setup();
    // Create 11 valid files.
    const refs: string[] = [];
    for (let i = 0; i < 11; i++) {
      const f = await createFile({
        tenantId: tenant.id,
        workspaceId: ws.id,
        uploaderUserId: user.user.id,
      });
      refs.push(buildAttachmentRef(f.id));
    }

    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Too many', attachmentIds: refs });
    expect(res.status).toBe(400);
  });

  it('400 when attachment ref has invalid format', async () => {
    const { tenant, ws, proj, issue, token } = await setup();
    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Bad ref', attachmentIds: ['not-a-valid-ref'] });
    expect(res.status).toBe(400);
  });

  it('400 when attachment ref points to a file in another workspace', async () => {
    const { tenant, ws, proj, issue, token } = await setup();

    // Create a file in a DIFFERENT workspace.
    const otherOwner = await createUser();
    await addTenantMember(otherOwner.user.id, tenant.id, 'admin');
    const otherWs = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(otherOwner.user.id, otherWs.id, 'admin');
    const otherFile = await createFile({
      tenantId: tenant.id,
      workspaceId: otherWs.id,
      uploaderUserId: otherOwner.user.id,
    });
    const ref = buildAttachmentRef(otherFile.id);

    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Cross-ws ref', attachmentIds: [ref] });
    expect(res.status).toBe(400);
  });

  it('403 when caller has read role', async () => {
    const { tenant, ws, proj, issue } = await setup();
    const readUser = await createUser();
    await addTenantMember(readUser.user.id, tenant.id, 'write');
    await addWorkspaceMember(readUser.user.id, ws.id, 'read');
    const { token: readToken } = await loginAs(readUser.user.email, readUser.password);

    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${readToken}`)
      .send({ body: 'Should not work' });
    expect(res.status).toBe(403);
  });

  it('409 when workspace is archived', async () => {
    const { tenant, ws, proj, issue, token } = await setup();
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(commentsUrl(tenant.slug, ws.slug, proj.slug, issue.key))
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Archived workspace' });
    expect(res.status).toBe(409);
  });
});
