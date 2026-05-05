import { describe, it, expect } from 'vitest';
import {
  parseAttachmentRef,
  buildAttachmentRef,
  extractFileIds,
} from '../../src/lib/attachmentRefs.js';

const VALID_UUID = '01234567-89ab-cdef-0123-456789abcdef';

describe('parseAttachmentRef', () => {
  it('returns the uuid when the ref is well-formed', () => {
    expect(parseAttachmentRef(`attachment:${VALID_UUID}`)).toBe(VALID_UUID);
  });

  it('is case-insensitive on the uuid hex chars', () => {
    const upper = `attachment:${VALID_UUID.toUpperCase()}`;
    expect(parseAttachmentRef(upper)).toBeTruthy();
  });

  it('returns null for a plain uuid with no prefix', () => {
    expect(parseAttachmentRef(VALID_UUID)).toBeNull();
  });

  it('returns null for the wrong prefix', () => {
    expect(parseAttachmentRef(`file:${VALID_UUID}`)).toBeNull();
  });

  it('returns null for a malformed uuid (too short)', () => {
    expect(parseAttachmentRef('attachment:bad-uuid')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseAttachmentRef('')).toBeNull();
  });
});

describe('buildAttachmentRef', () => {
  it('prepends the attachment: prefix', () => {
    expect(buildAttachmentRef('abc')).toBe('attachment:abc');
  });

  it('round-trips with parseAttachmentRef', () => {
    const ref = buildAttachmentRef(VALID_UUID);
    expect(parseAttachmentRef(ref)).toBe(VALID_UUID);
  });
});

describe('extractFileIds', () => {
  it('returns uuids for valid refs and skips malformed entries', () => {
    const uuid2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const refs = [
      `attachment:${VALID_UUID}`,
      'bad-ref',
      `attachment:${uuid2}`,
    ];
    expect(extractFileIds(refs)).toEqual([VALID_UUID, uuid2]);
  });

  it('returns [] for an empty array', () => {
    expect(extractFileIds([])).toEqual([]);
  });

  it('returns [] when all refs are malformed', () => {
    expect(extractFileIds(['bad', 'also-bad', 'file:uuid'])).toEqual([]);
  });
});
