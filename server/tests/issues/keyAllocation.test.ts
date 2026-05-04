import { describe, it, expect } from 'vitest';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  createProject,
  createIssue,
} from '../helpers/factories.js';

describe('issue key allocation — concurrency', () => {
  it('produces distinct sequential keys with no gaps under concurrent creates', async () => {
    const { user } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const proj = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      key: 'CONC',
    });

    const N = 10;
    const created = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        createIssue({
          workspaceId: ws.id,
          projectId: proj.id,
          reporterUserId: user.id,
          title: `Concurrent ${i}`,
        })
      )
    );

    const seqs = created.map((i) => i.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));

    const keys = created.map((i) => i.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(N);
    for (const key of keys) {
      expect(key.startsWith('CONC-')).toBe(true);
    }
  });

  it('per-project counters are independent: concurrent creates across two projects are interleaved without collision', async () => {
    const { user } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const projA = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      slug: 'a',
      key: 'A',
    });
    const projB = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      slug: 'b',
      key: 'B',
    });

    const tasks: Promise<unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(
        createIssue({ workspaceId: ws.id, projectId: projA.id, reporterUserId: user.id })
      );
      tasks.push(
        createIssue({ workspaceId: ws.id, projectId: projB.id, reporterUserId: user.id })
      );
    }
    const results = (await Promise.all(tasks)) as Array<{ key: string; seq: number; projectId: string }>;

    const aIssues = results.filter((r) => r.projectId === projA.id);
    const bIssues = results.filter((r) => r.projectId === projB.id);
    expect(aIssues.map((i) => i.seq).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(bIssues.map((i) => i.seq).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});
