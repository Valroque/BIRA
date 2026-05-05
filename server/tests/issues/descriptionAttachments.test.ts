/**
 * Slice C — issue description attachment refs.
 *
 * Mirrors the comment-attachment specs (tests/comments/create.test.ts):
 * the storage shape and validation rules are intentionally identical
 * (same `attachment:<uuid>` ref scheme, same workspace-scoped existence
 * check). The only differences are: max 20 (not 10) and the field
 * lives on issues, not comments.
 */
import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  createProject,
  createFile,
  loginAs,
} from '../helpers/factories.js';
import { buildAttachmentRef } from '../../src/lib/attachmentRefs.js';
import * as fileService from '../../src/services/fileService.js';

async function setup() {
  const user = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  await addWorkspaceMember(user.user.id, ws.id, 'admin');
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.user.id,
    key: 'DAT',
  });
  const { token } = await loginAs(user.user.email, user.password);
  return { user, tenant, ws, proj, token };
}

function issuesUrl(tenantSlug: string, wsSlug: string, projSlug: string) {
  return `/api/tenants/${tenantSlug}/workspaces/${wsSlug}/projects/${projSlug}/issues`;
}

describe('Issue description attachments — create', () => {
  it('201 happy path: stores refs, returns descriptionAttachments expanded on detail view', async () => {
    const { tenant, ws, proj, token, user } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    const res = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'T',
        title: 'Has an attached image',
        description: 'See screenshot',
        descriptionAttachmentIds: [ref],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.descriptionAttachmentIds).toEqual([ref]);
    expect(res.body.data.descriptionAttachments).toHaveLength(1);
    expect(res.body.data.descriptionAttachments[0].id).toBe(file.id);
    expect(res.body.data.descriptionAttachments[0].readUrl).toBeTruthy();
  });

  it('201 with empty array → field defaults to []', async () => {
    const { tenant, ws, proj, token } = await setup();
    const res = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'T', title: 'Plain', descriptionAttachmentIds: [] });
    expect(res.status).toBe(201);
    expect(res.body.data.descriptionAttachmentIds).toEqual([]);
    expect(res.body.data.descriptionAttachments).toEqual([]);
  });

  it('201 when omitted → field defaults to []', async () => {
    const { tenant, ws, proj, token } = await setup();
    const res = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'T', title: 'No attachments at all' });
    expect(res.status).toBe(201);
    expect(res.body.data.descriptionAttachmentIds).toEqual([]);
  });

  it('201 allowed on every issue type — Epic carries description attachments', async () => {
    const { tenant, ws, proj, token, user } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    const res = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'E', title: 'Epic with image', descriptionAttachmentIds: [ref] });
    expect(res.status).toBe(201);
    expect(res.body.data.descriptionAttachmentIds).toEqual([ref]);
  });

  it('400 when ref has invalid format', async () => {
    const { tenant, ws, proj, token } = await setup();
    const res = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'T',
        title: 'Bad ref',
        descriptionAttachmentIds: ['attachment:bad'],
      });
    expect(res.status).toBe(400);
  });

  it('400 when ref points to a file in another workspace', async () => {
    const { tenant, ws, proj, token } = await setup();

    // File in a different workspace under the same tenant.
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
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'T',
        title: 'Cross-ws ref',
        descriptionAttachmentIds: [ref],
      });
    expect(res.status).toBe(400);
  });

  it('400 when more than 20 refs are provided', async () => {
    const { tenant, ws, proj, token, user } = await setup();
    const refs: string[] = [];
    for (let i = 0; i < 21; i++) {
      const f = await createFile({
        tenantId: tenant.id,
        workspaceId: ws.id,
        uploaderUserId: user.user.id,
      });
      refs.push(buildAttachmentRef(f.id));
    }

    const res = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'T',
        title: 'Too many',
        descriptionAttachmentIds: refs,
      });
    expect(res.status).toBe(400);
  });
});

describe('Issue description attachments — get', () => {
  it('200 GET expands descriptionAttachments with readUrl', async () => {
    const { tenant, ws, proj, token, user } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
      filename: 'screenshot.png',
    });
    const ref = buildAttachmentRef(file.id);

    const createRes = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'T',
        title: 'Will be fetched',
        descriptionAttachmentIds: [ref],
      });
    expect(createRes.status).toBe(201);
    const key = createRes.body.data.key;

    const getRes = await api()
      .get(`${issuesUrl(tenant.slug, ws.slug, proj.slug)}/${key}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.descriptionAttachmentIds).toEqual([ref]);
    expect(getRes.body.data.descriptionAttachments).toHaveLength(1);
    expect(getRes.body.data.descriptionAttachments[0].id).toBe(file.id);
    expect(getRes.body.data.descriptionAttachments[0].filename).toBe('screenshot.png');
    expect(getRes.body.data.descriptionAttachments[0].readUrl).toBeTruthy();
  });

  it('GET silently drops dangling refs from descriptionAttachments after the file is deleted', async () => {
    const { tenant, ws, proj, token, user } = await setup();
    const fileA = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
      filename: 'a.png',
    });
    const fileB = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
      filename: 'b.png',
    });
    const refA = buildAttachmentRef(fileA.id);
    const refB = buildAttachmentRef(fileB.id);

    const createRes = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'T',
        title: 'Two attachments',
        descriptionAttachmentIds: [refA, refB],
      });
    expect(createRes.status).toBe(201);
    const key = createRes.body.data.key;

    // Hard-delete fileA at the service layer (mirrors what the files API does).
    await fileService.deleteById(fileA.id);

    const getRes = await api()
      .get(`${issuesUrl(tenant.slug, ws.slug, proj.slug)}/${key}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    // Raw refs are preserved verbatim — source of truth.
    expect(getRes.body.data.descriptionAttachmentIds).toEqual([refA, refB]);
    // Expanded view drops the dangling one.
    expect(getRes.body.data.descriptionAttachments).toHaveLength(1);
    expect(getRes.body.data.descriptionAttachments[0].id).toBe(fileB.id);
  });
});

describe('Issue description attachments — update', () => {
  it('200 PATCH adds description attachments', async () => {
    const { tenant, ws, proj, token, user } = await setup();

    const createRes = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'T', title: 'Will gain attachments' });
    expect(createRes.status).toBe(201);
    const key = createRes.body.data.key;

    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    const patchRes = await api()
      .patch(`${issuesUrl(tenant.slug, ws.slug, proj.slug)}/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ descriptionAttachmentIds: [ref] });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.descriptionAttachmentIds).toEqual([ref]);
    expect(patchRes.body.data.descriptionAttachments).toHaveLength(1);
    expect(patchRes.body.data.descriptionAttachments[0].id).toBe(file.id);
  });

  it('200 PATCH with [] clears the attachments', async () => {
    const { tenant, ws, proj, token, user } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    const createRes = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'T',
        title: 'Has attachment to clear',
        descriptionAttachmentIds: [ref],
      });
    const key = createRes.body.data.key;

    const patchRes = await api()
      .patch(`${issuesUrl(tenant.slug, ws.slug, proj.slug)}/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ descriptionAttachmentIds: [] });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.descriptionAttachmentIds).toEqual([]);
    expect(patchRes.body.data.descriptionAttachments).toEqual([]);
  });

  it('200 PATCH with only descriptionAttachmentIds (no other fields) — at-least-one rule honours it', async () => {
    const { tenant, ws, proj, token, user } = await setup();
    const createRes = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'T', title: 'Patch sole field' });
    const key = createRes.body.data.key;

    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    const patchRes = await api()
      .patch(`${issuesUrl(tenant.slug, ws.slug, proj.slug)}/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ descriptionAttachmentIds: [ref] });

    expect(patchRes.status).toBe(200);
  });

  it('400 PATCH with malformed ref', async () => {
    const { tenant, ws, proj, token } = await setup();
    const createRes = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'T', title: 'Will reject bad ref' });
    const key = createRes.body.data.key;

    const patchRes = await api()
      .patch(`${issuesUrl(tenant.slug, ws.slug, proj.slug)}/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ descriptionAttachmentIds: ['attachment:bad'] });

    expect(patchRes.status).toBe(400);
  });

  it('400 PATCH with > 20 refs', async () => {
    const { tenant, ws, proj, token, user } = await setup();
    const createRes = await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'T', title: 'Will reject too many' });
    const key = createRes.body.data.key;

    const refs: string[] = [];
    for (let i = 0; i < 21; i++) {
      const f = await createFile({
        tenantId: tenant.id,
        workspaceId: ws.id,
        uploaderUserId: user.user.id,
      });
      refs.push(buildAttachmentRef(f.id));
    }

    const patchRes = await api()
      .patch(`${issuesUrl(tenant.slug, ws.slug, proj.slug)}/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ descriptionAttachmentIds: refs });
    expect(patchRes.status).toBe(400);
  });
});

describe('Issue description attachments — list endpoints', () => {
  it('list endpoint includes descriptionAttachmentIds (raw) but NOT descriptionAttachments (expanded)', async () => {
    const { tenant, ws, proj, token, user } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
    });
    const ref = buildAttachmentRef(file.id);

    await api()
      .post(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'T',
        title: 'Listed issue',
        descriptionAttachmentIds: [ref],
      });

    const listRes = await api()
      .get(issuesUrl(tenant.slug, ws.slug, proj.slug))
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].descriptionAttachmentIds).toEqual([ref]);
    // Expansion is detail-view only — list keeps payloads bounded.
    expect(listRes.body.data[0].descriptionAttachments).toBeUndefined();

    // Workspace-scoped list — same rule.
    const wsListRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/issues`)
      .set('Authorization', `Bearer ${token}`);
    expect(wsListRes.status).toBe(200);
    expect(wsListRes.body.data[0].descriptionAttachmentIds).toEqual([ref]);
    expect(wsListRes.body.data[0].descriptionAttachments).toBeUndefined();
  });
});
