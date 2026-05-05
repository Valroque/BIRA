import { describe, it, expect } from 'vitest';
import { File, type FileRow } from '../../src/entities/File.js';
import { EntityError } from '../../src/lib/errors.js';

const VALID_SHA256 = 'a'.repeat(64);

const baseRow = (): FileRow => ({
  id: 'f-1',
  tenantId: 't-1',
  workspaceId: 'ws-1',
  uploaderUserId: 'u-1',
  mime: 'image/png',
  size: 42,
  sha256: VALID_SHA256,
  filename: 'test.png',
  storageKey: 'sk-abc',
  createdAt: new Date('2026-05-09T00:00:00Z'),
  updatedAt: null,
});

describe('File.fromRow', () => {
  it('constructs a valid File from all fields', () => {
    const f = File.fromRow(baseRow());
    expect(f.id).toBe('f-1');
    expect(f.tenantId).toBe('t-1');
    expect(f.workspaceId).toBe('ws-1');
    expect(f.uploaderUserId).toBe('u-1');
    expect(f.mime).toBe('image/png');
    expect(f.size).toBe(42);
    expect(f.sha256).toBe(VALID_SHA256);
    expect(f.filename).toBe('test.png');
    expect(f.storageKey).toBe('sk-abc');
    expect(f.createdAt).toBe('2026-05-09T00:00:00.000Z');
    expect(f.updatedAt).toBeNull();
  });

  it('coerces size from string to number', () => {
    const f = File.fromRow({ ...baseRow(), size: '42' });
    expect(f.size).toBe(42);
    expect(typeof f.size).toBe('number');
  });

  it('uploaderUserId is null when row value is null', () => {
    const f = File.fromRow({ ...baseRow(), uploaderUserId: null });
    expect(f.uploaderUserId).toBeNull();
  });

  it('updatedAt is a string when set', () => {
    const f = File.fromRow({
      ...baseRow(),
      updatedAt: new Date('2026-05-09T01:00:00Z'),
    });
    expect(f.updatedAt).toBe('2026-05-09T01:00:00.000Z');
  });
});

describe('File invariants', () => {
  it('throws EntityError when id is missing', () => {
    expect(() => File.fromRow({ ...baseRow(), id: '' })).toThrow(EntityError);
  });

  it('throws EntityError when tenantId is missing', () => {
    expect(() => File.fromRow({ ...baseRow(), tenantId: '' })).toThrow(EntityError);
  });

  it('throws EntityError when workspaceId is missing', () => {
    expect(() => File.fromRow({ ...baseRow(), workspaceId: '' })).toThrow(EntityError);
  });

  it('throws EntityError when mime is missing', () => {
    expect(() => File.fromRow({ ...baseRow(), mime: '' })).toThrow(EntityError);
  });

  it('throws EntityError when sha256 is wrong length (short)', () => {
    expect(() => File.fromRow({ ...baseRow(), sha256: 'abc123' })).toThrow(EntityError);
  });

  it('throws EntityError when sha256 is wrong length (too long)', () => {
    expect(() => File.fromRow({ ...baseRow(), sha256: 'a'.repeat(65) })).toThrow(EntityError);
  });

  it('throws EntityError when sha256 contains non-hex characters', () => {
    // 64 chars but includes uppercase (must be lowercase hex)
    expect(
      () => File.fromRow({ ...baseRow(), sha256: 'A'.repeat(64) })
    ).toThrow(EntityError);
  });

  it('throws EntityError for negative size', () => {
    expect(() => File.fromRow({ ...baseRow(), size: -1 })).toThrow(EntityError);
  });

  it('throws EntityError for size exceeding 10 MB', () => {
    expect(() => File.fromRow({ ...baseRow(), size: 10_485_761 })).toThrow(EntityError);
  });

  it('accepts size exactly at the 10 MB limit', () => {
    expect(() => File.fromRow({ ...baseRow(), size: 10_485_760 })).not.toThrow();
  });

  it('accepts size of 0', () => {
    // 0 bytes is allowed at the entity layer (uploadFile usecase rejects it)
    expect(() => File.fromRow({ ...baseRow(), size: 0 })).not.toThrow();
  });
});
