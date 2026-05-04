import { describe, expect, it } from 'vitest';
import { User, type UserRow } from '../../src/entities/User.js';
import { EntityError } from '../../src/lib/errors.js';

const baseRow = (): Omit<UserRow, 'passwordHash'> => ({
  id: 'u-1',
  email: 'jordan@test.local',
  firstName: 'Jordan',
  lastName: 'Lee',
  avatar: null,
  phone: null,
  isActive: true,
  mustResetPassword: false,
  lastLogin: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: null,
});

describe('User.fromRow', () => {
  it('maps a full row, derives displayName, ISO createdAt, null lastLogin', () => {
    const u = User.fromRow({ ...baseRow(), passwordHash: 'irrelevant' } as UserRow);
    expect(u.id).toBe('u-1');
    expect(u.displayName).toBe('Jordan Lee');
    expect(u.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(u.lastLogin).toBeNull();
  });

  it('mustResetPassword defaults to false when row value is null', () => {
    // Defensive coercion called out in User.ts — predates the column.
    const row = { ...baseRow(), mustResetPassword: null as unknown as boolean };
    const u = new User(row);
    expect(u.mustResetPassword).toBe(false);
  });

  it('mustResetPassword defaults to false when row value is undefined', () => {
    const row = { ...baseRow(), mustResetPassword: undefined as unknown as boolean };
    const u = new User(row);
    expect(u.mustResetPassword).toBe(false);
  });

});

describe('User constructor required fields', () => {
  it('throws EntityError when id is missing', () => {
    expect(() => new User({ ...baseRow(), id: '' })).toThrow(EntityError);
  });

  it('throws EntityError when email is missing', () => {
    expect(() => new User({ ...baseRow(), email: '' })).toThrow(EntityError);
  });

  it('throws EntityError when firstName is missing', () => {
    expect(() => new User({ ...baseRow(), firstName: '' })).toThrow(EntityError);
  });

  it('throws EntityError when lastName is missing', () => {
    expect(() => new User({ ...baseRow(), lastName: '' })).toThrow(EntityError);
  });

  it('throws EntityError when createdAt is missing', () => {
    expect(
      () => new User({ ...baseRow(), createdAt: '' as unknown as string })
    ).toThrow(EntityError);
  });
});

describe('User#displayName trimming', () => {
  it('strips trailing whitespace when lastName is just spaces', () => {
    // lastName must be truthy to pass required() — use a non-empty
    // whitespace-only string so the trim() in the getter is observable.
    const u = new User({ ...baseRow(), lastName: ' ' });
    expect(u.displayName).toBe('Jordan');
  });
});

describe('User#toJSON', () => {
  it('returns the documented key set; never exposes passwordHash', () => {
    const u = User.fromRow({ ...baseRow(), passwordHash: 'secret' } as UserRow);
    const json = u.toJSON();
    expect(Object.keys(json).sort()).toEqual(
      [
        'avatar',
        'createdAt',
        'displayName',
        'email',
        'firstName',
        'id',
        'isActive',
        'lastLogin',
        'lastName',
        'mustResetPassword',
        'phone',
        'updatedAt',
      ].sort()
    );
    expect('passwordHash' in json).toBe(false);
  });
});
