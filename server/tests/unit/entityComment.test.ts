import { describe, it, expect } from 'vitest';
import { Comment, type CommentRow } from '../../src/entities/Comment.js';
import { EntityError } from '../../src/lib/errors.js';

const baseRow = (): CommentRow => ({
  id: 'c-1',
  tenantId: 't-1',
  workspaceId: 'ws-1',
  issueId: 'iss-1',
  authorUserId: 'u-1',
  body: 'Hello world',
  attachmentIds: [],
  createdAt: new Date('2026-05-09T00:00:00Z'),
  updatedAt: null,
});

describe('Comment.fromRow', () => {
  it('constructs a valid Comment from all fields', () => {
    const c = Comment.fromRow(baseRow());
    expect(c.id).toBe('c-1');
    expect(c.tenantId).toBe('t-1');
    expect(c.workspaceId).toBe('ws-1');
    expect(c.issueId).toBe('iss-1');
    expect(c.authorUserId).toBe('u-1');
    expect(c.body).toBe('Hello world');
    expect(c.attachmentIds).toEqual([]);
    expect(c.createdAt).toBe('2026-05-09T00:00:00.000Z');
    expect(c.updatedAt).toBeNull();
  });

  it('authorUserId defaults to null when not provided', () => {
    const c = Comment.fromRow({ ...baseRow(), authorUserId: null });
    expect(c.authorUserId).toBeNull();
  });

  it('updatedAt is an ISO string when set', () => {
    const c = Comment.fromRow({
      ...baseRow(),
      updatedAt: new Date('2026-05-09T01:00:00Z'),
    });
    expect(c.updatedAt).toBe('2026-05-09T01:00:00.000Z');
  });

  it('attachmentIds defaults to [] when not an array', () => {
    // Simulate a row with an unexpected null from a misconfigured DB column.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = Comment.fromRow({ ...baseRow(), attachmentIds: null as any });
    expect(c.attachmentIds).toEqual([]);
  });
});

describe('Comment invariants', () => {
  it('throws EntityError when id is missing', () => {
    expect(() => Comment.fromRow({ ...baseRow(), id: '' })).toThrow(EntityError);
  });

  it('throws EntityError when tenantId is missing', () => {
    expect(() => Comment.fromRow({ ...baseRow(), tenantId: '' })).toThrow(EntityError);
  });

  it('throws EntityError when workspaceId is missing', () => {
    expect(() => Comment.fromRow({ ...baseRow(), workspaceId: '' })).toThrow(EntityError);
  });

  it('throws EntityError when issueId is missing', () => {
    expect(() => Comment.fromRow({ ...baseRow(), issueId: '' })).toThrow(EntityError);
  });

  it('throws when body is empty', () => {
    expect(() => Comment.fromRow({ ...baseRow(), body: '' })).toThrow();
  });
});
