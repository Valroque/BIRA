import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  comparePassword,
  generateTemporaryPassword,
} from '../../src/lib/passwordUtils.js';

describe('hashPassword + comparePassword', () => {
  it('hash differs from plaintext', async () => {
    const hash = await hashPassword('password123');
    expect(hash).not.toBe('password123');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('comparePassword returns true for matching plaintext', async () => {
    const hash = await hashPassword('password123');
    expect(await comparePassword('password123', hash)).toBe(true);
  });

  it('comparePassword returns false for wrong plaintext', async () => {
    const hash = await hashPassword('password123');
    expect(await comparePassword('not-it', hash)).toBe(false);
  });

  it('comparePassword returns false for empty string', async () => {
    const hash = await hashPassword('password123');
    expect(await comparePassword('', hash)).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  const TEMP_RE = /^[A-HJ-NP-Za-hj-km-np-z2-9]{16}$/;

  it('returns 16 chars from the unambiguous alphabet', () => {
    const pwd = generateTemporaryPassword();
    expect(pwd).toHaveLength(16);
    expect(pwd).toMatch(TEMP_RE);
  });

  it('100 calls all match the alphabet and are unique', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const pwd = generateTemporaryPassword();
      expect(pwd).toMatch(TEMP_RE);
      seen.add(pwd);
    }
    expect(seen.size).toBe(100);
  });
});
