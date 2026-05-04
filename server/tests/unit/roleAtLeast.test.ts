import { describe, expect, it } from 'vitest';
import { roleAtLeast } from '../../src/lib/constants.js';

describe('roleAtLeast', () => {
  it('admin satisfies admin/write/read', () => {
    expect(roleAtLeast('admin', 'admin')).toBe(true);
    expect(roleAtLeast('admin', 'write')).toBe(true);
    expect(roleAtLeast('admin', 'read')).toBe(true);
  });

  it('write satisfies write/read but not admin', () => {
    expect(roleAtLeast('write', 'admin')).toBe(false);
    expect(roleAtLeast('write', 'write')).toBe(true);
    expect(roleAtLeast('write', 'read')).toBe(true);
  });

  it('read satisfies read but not write/admin', () => {
    expect(roleAtLeast('read', 'admin')).toBe(false);
    expect(roleAtLeast('read', 'write')).toBe(false);
    expect(roleAtLeast('read', 'read')).toBe(true);
  });

  it('null role never satisfies', () => {
    expect(roleAtLeast(null, 'read')).toBe(false);
  });

  it('undefined role never satisfies', () => {
    expect(roleAtLeast(undefined, 'read')).toBe(false);
  });
});
