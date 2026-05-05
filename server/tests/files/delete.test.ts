import { describe, it, expect } from 'vitest';
import { db } from '../../src/db/knex.js';
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
  const owner = await createUser();
  const tenant = await createTenant();
  await addTenantMember(owner.user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  await addWorkspaceMember(owner.user.id, ws.id, 'admin');
  const { token } = await loginAs(owner.user.email, owner.password);
  return { owner, tenant, ws, token };
}

function fileUrl(tenantSlug: string, wsSlug: string, fileId: string) {
  return `/api/tenants/${tenantSlug}/workspaces/${wsSlug}/files/${fileId}`;
}

/** Returns true if the row exists in the given table. */
async function rowExists(table: string, id: string): Promise<boolean> {
  const row = await db(table)
    .where(table === 'file_blobs' ? 'file_id' : 'id', id)
    .first();
  return row !== undefined;
}

describe('DELETE /api/tenants/:t/workspaces/:w/files/:id', () => {
  it('204 uploader can delete their own file; both rows are gone', async () => {
    const { owner, tenant, ws, token } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: owner.user.id,
    });

    const res = await api()
      .delete(fileUrl(tenant.slug, ws.slug, file.id))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    // Both rows must be removed.
    expect(await rowExists('files', file.id)).toBe(false);
    expect(await rowExists('file_blobs', file.storageKey)).toBe(false);
  });

  it('204 workspace admin can delete another users file', async () => {
    const { tenant, ws, token: adminToken } = await setup();
    // create a separate uploader (write role)
    const uploader = await createUser();
    await addTenantMember(uploader.user.id, tenant.id, 'write');
    await addWorkspaceMember(uploader.user.id, ws.id, 'write');

    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: uploader.user.id,
    });

    const res = await api()
      .delete(fileUrl(tenant.slug, ws.slug, file.id))
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
    expect(await rowExists('files', file.id)).toBe(false);
  });

  it('403 non-uploader write user cannot delete another users file', async () => {
    const { owner, tenant, ws } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: owner.user.id,
    });

    // create a second write user who is NOT the uploader
    const other = await createUser();
    await addTenantMember(other.user.id, tenant.id, 'write');
    await addWorkspaceMember(other.user.id, ws.id, 'write');
    const { token: otherToken } = await loginAs(other.user.email, other.password);

    const res = await api()
      .delete(fileUrl(tenant.slug, ws.slug, file.id))
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('403 read user cannot delete any file', async () => {
    const { owner, tenant, ws } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: owner.user.id,
    });

    const readUser = await createUser();
    await addTenantMember(readUser.user.id, tenant.id, 'write');
    await addWorkspaceMember(readUser.user.id, ws.id, 'read');
    const { token: readToken } = await loginAs(readUser.user.email, readUser.password);

    const res = await api()
      .delete(fileUrl(tenant.slug, ws.slug, file.id))
      .set('Authorization', `Bearer ${readToken}`);
    expect(res.status).toBe(403);
  });

  it('404 when file belongs to a different workspace', async () => {
    const { owner, tenant, token } = await setup();
    const ws1 = await createWorkspace({ tenantId: tenant.id });
    const ws2 = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(owner.user.id, ws1.id, 'admin');
    await addWorkspaceMember(owner.user.id, ws2.id, 'admin');

    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws2.id,
      uploaderUserId: owner.user.id,
    });

    // try to delete via ws1's URL (wrong workspace)
    const res = await api()
      .delete(fileUrl(tenant.slug, ws1.slug, file.id))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('404 on second delete attempt (already deleted)', async () => {
    const { owner, tenant, ws, token } = await setup();
    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: owner.user.id,
    });

    await api()
      .delete(fileUrl(tenant.slug, ws.slug, file.id))
      .set('Authorization', `Bearer ${token}`);

    // second attempt must 404
    const res = await api()
      .delete(fileUrl(tenant.slug, ws.slug, file.id))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
