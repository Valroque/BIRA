import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  createFile,
  loginAs,
} from '../helpers/factories.js';

async function setup() {
  const user = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  await addWorkspaceMember(user.user.id, ws.id, 'admin');
  const { token } = await loginAs(user.user.email, user.password);
  return { user, tenant, ws, token };
}

function fileUrl(tenantSlug: string, wsSlug: string, fileId: string) {
  return `/api/tenants/${tenantSlug}/workspaces/${wsSlug}/files/${fileId}`;
}

describe('GET /api/tenants/:t/workspaces/:w/files/:id', () => {
  it('200 and bytes round-trip: downloaded bytes match uploaded bytes', async () => {
    const { user, tenant, ws, token } = await setup();
    const knownBytes = Buffer.from('round-trip-content-abc');
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
      mime: 'text/plain',
      filename: 'roundtrip.txt',
      bytes: knownBytes,
    });

    const res = await api()
      .get(fileUrl(tenant.slug, ws.slug, file.id))
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.equals(knownBytes)).toBe(true);
  });

  it('response has correct Content-Type and Content-Disposition headers', async () => {
    const { user, tenant, ws, token } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: user.user.id,
      mime: 'image/png',
      filename: 'photo.png',
      bytes: Buffer.from('fakepng'),
    });

    const res = await api()
      .get(fileUrl(tenant.slug, ws.slug, file.id))
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['content-disposition']).toContain('photo.png');
    expect(res.headers['content-disposition']).toContain('inline');
  });

  it('404 when file belongs to a different workspace', async () => {
    const { user, tenant, token } = await setup();
    // file is in ws2, we try to fetch it via ws1's slug
    const ws1 = await createWorkspace({ tenantId: tenant.id });
    const ws2 = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.user.id, ws1.id, 'admin');
    await addWorkspaceMember(user.user.id, ws2.id, 'admin');

    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws2.id,
      uploaderUserId: user.user.id,
    });

    const res = await api()
      .get(fileUrl(tenant.slug, ws1.slug, file.id))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('404 for a non-existent file id', async () => {
    const { tenant, ws, token } = await setup();
    const res = await api()
      .get(fileUrl(tenant.slug, ws.slug, '00000000-0000-0000-0000-000000000000'))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
