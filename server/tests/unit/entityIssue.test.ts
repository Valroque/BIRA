import { describe, expect, it } from 'vitest';
import { Issue, type IssueRow } from '../../src/entities/Issue.js';
import { EntityError } from '../../src/lib/errors.js';

const baseRow = (): IssueRow => ({
  id: 'i-1',
  workspaceId: 'ws-1',
  projectId: 'p-1',
  key: 'CMT-1',
  seq: 1,
  type: 'T',
  status: 'backlog',
  priority: 'none',
  title: 'Initial issue',
  description: null,
  labels: [],
  assigneeUserId: null,
  reporterUserId: null,
  createdAt: new Date('2026-05-04T00:00:00Z'),
  updatedAt: null,
});

describe('Issue.fromRow', () => {
  it('round-trips a complete row', () => {
    const i = Issue.fromRow({
      ...baseRow(),
      description: 'A body',
      labels: ['bug', 'p1'],
      assigneeUserId: 'u-1',
      reporterUserId: 'u-2',
      updatedAt: new Date('2026-05-04T01:00:00Z'),
    });
    expect(i.id).toBe('i-1');
    expect(i.workspaceId).toBe('ws-1');
    expect(i.projectId).toBe('p-1');
    expect(i.key).toBe('CMT-1');
    expect(i.seq).toBe(1);
    expect(i.type).toBe('T');
    expect(i.status).toBe('backlog');
    expect(i.priority).toBe('none');
    expect(i.title).toBe('Initial issue');
    expect(i.description).toBe('A body');
    expect(i.labels).toEqual(['bug', 'p1']);
    expect(i.assigneeUserId).toBe('u-1');
    expect(i.reporterUserId).toBe('u-2');
    expect(i.createdAt).toBe('2026-05-04T00:00:00.000Z');
    expect(i.updatedAt).toBe('2026-05-04T01:00:00.000Z');
  });

  it('description defaults to null when row value is null/undefined', () => {
    const i = Issue.fromRow({ ...baseRow(), description: null });
    expect(i.description).toBeNull();
  });

  it('labels default to [] when row value is null/undefined', () => {
    const i = new Issue({ ...baseRow(), labels: undefined as unknown as string[] });
    expect(i.labels).toEqual([]);
  });

  it('updatedAt is null when row value is null', () => {
    const i = Issue.fromRow(baseRow());
    expect(i.updatedAt).toBeNull();
  });
});

describe('Issue invariants', () => {
  it('throws EntityError when id is missing', () => {
    expect(() => new Issue({ ...baseRow(), id: '' })).toThrow(EntityError);
  });
  it('throws EntityError when workspaceId is missing', () => {
    expect(() => new Issue({ ...baseRow(), workspaceId: '' })).toThrow(EntityError);
  });
  it('throws EntityError when projectId is missing', () => {
    expect(() => new Issue({ ...baseRow(), projectId: '' })).toThrow(EntityError);
  });
  it('throws EntityError when key is missing', () => {
    expect(() => new Issue({ ...baseRow(), key: '' })).toThrow(EntityError);
  });
  it('throws EntityError when title is missing', () => {
    expect(() => new Issue({ ...baseRow(), title: '' })).toThrow(EntityError);
  });
  it('throws EntityError when createdAt is missing', () => {
    expect(
      () => new Issue({ ...baseRow(), createdAt: '' as unknown as string })
    ).toThrow(EntityError);
  });

  it('rejects an invalid issue type', () => {
    expect(
      () => new Issue({ ...baseRow(), type: 'X' as unknown as IssueRow['type'] })
    ).toThrow(EntityError);
  });
  it('rejects an invalid status', () => {
    expect(
      () =>
        new Issue({
          ...baseRow(),
          status: 'archived' as unknown as IssueRow['status'],
        })
    ).toThrow(EntityError);
  });
  it('rejects an invalid priority', () => {
    expect(
      () =>
        new Issue({
          ...baseRow(),
          priority: 'critical' as unknown as IssueRow['priority'],
        })
    ).toThrow(EntityError);
  });
  it('rejects a malformed key (lowercase prefix)', () => {
    expect(() => new Issue({ ...baseRow(), key: 'cmt-1' })).toThrow(EntityError);
  });
  it('rejects a malformed key (missing seq)', () => {
    expect(() => new Issue({ ...baseRow(), key: 'CMT-' })).toThrow(EntityError);
  });
  it('rejects a malformed key (no dash)', () => {
    expect(() => new Issue({ ...baseRow(), key: 'CMT1' })).toThrow(EntityError);
  });
});
