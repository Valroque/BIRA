import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  loginAs,
} from '../helpers/factories.js';

// ── shared setup ─────────────────────────────────────────────────────────

async function setup() {
  const user = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  await addWorkspaceMember(user.user.id, ws.id, 'admin');
  const { token } = await loginAs(user.user.email, user.password);
  return { user, tenant, ws, token };
}

function filesUrl(tenantSlug: string, wsSlug: string) {
  return `/api/tenants/${tenantSlug}/workspaces/${wsSlug}/files`;
}

// ── upload ────────────────────────────────────────────────────────────────

describe('POST /api/tenants/:t/workspaces/:w/files', () => {
  it('201 happy path: returns FileView with expected fields and readUrl', async () => {
    const { tenant, ws, token } = await setup();
    const res = await api()
      .post(filesUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hello world'), {
        filename: 'hello.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data.id).toBeTruthy();
    expect(data.filename).toBe('hello.txt');
    expect(data.mime).toBe('text/plain');
    expect(data.size).toBe(11); // 'hello world' = 11 bytes
    expect(data.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(data.uploaderUserId).toBeTruthy();
    expect(data.createdAt).toBeTruthy();
    // readUrl is the signed-URL form served by the public files route
    // (powers `<img src>` cross-origin loads — see `feedback_xorigin_asset_checklist.md`).
    // Shape: <PUBLIC_API_URL>/api/files/<id>?sig=<hex>&exp=<unix-seconds>.
    expect(data.readUrl).toMatch(
      new RegExp(`^https?://[^/]+/api/files/${data.id}\\?sig=[0-9a-f]+&exp=\\d+$`)
    );
  });

  it('403 when caller has read role', async () => {
    const { tenant, ws } = await setup();
    // create a second user with read-only access
    const readUser = await createUser();
    await addTenantMember(readUser.user.id, tenant.id, 'write');
    await addWorkspaceMember(readUser.user.id, ws.id, 'read');
    const { token: readToken } = await loginAs(readUser.user.email, readUser.password);

    const res = await api()
      .post(filesUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${readToken}`)
      .attach('file', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(403);
  });

  it('409 when workspace is archived', async () => {
    const { tenant, ws, token } = await setup();
    // archive the workspace first
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(filesUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(409);
  });

  it('400 when file field is missing from a valid multipart form', async () => {
    const { tenant, ws, token } = await setup();
    // Send a well-formed multipart body but with a different field name
    // so multer finds no 'file' field and req.file is undefined.
    const res = await api()
      .post(filesUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .attach('not_a_file', Buffer.from('x'), {
        filename: 'x.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
  });

  it('413 when payload exceeds 10 MB', async () => {
    const { tenant, ws, token } = await setup();
    const bigBuf = Buffer.alloc(11 * 1024 * 1024, 0x42); // 11 MB
    const res = await api()
      .post(filesUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', bigBuf, {
        filename: 'big.bin',
        contentType: 'application/octet-stream',
      });
    expect(res.status).toBe(413);
  });

  it('400 when buffer is zero bytes (uploadFile validation)', async () => {
    const { tenant, ws, token } = await setup();
    const res = await api()
      .post(filesUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.alloc(0), {
        filename: 'empty.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
  });
});
