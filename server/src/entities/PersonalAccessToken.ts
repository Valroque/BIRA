import { required, toISO } from './utils.js';

/**
 * Persisted shape (PUBLIC — never includes `tokenHash`). The hash is a
 * column on the table but is intentionally absent from this row type:
 * services that need to look up by hash do so via dedicated helpers, and
 * no caller — usecase, route, or test — should ever see the column.
 *
 * Mirrors the User pattern: `passwordHash` lives on `UserRowWithHash` in
 * the service, not on the entity.
 */
export interface PersonalAccessTokenRow {
  id: string;
  userId: string;
  name: string;
  last4: string;
  lastUsedAt: Date | string | null;
  expiresAt: Date | string | null;
  revokedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'PersonalAccessToken';

/**
 * Personal access token — a Bearer credential a user can mint as an
 * alternative to email/password login. The plaintext is shown exactly
 * once at create time and is never persisted or exposed afterwards.
 *
 * Security-relevant fields (`tokenHash`) live on the table but never on
 * this entity. Construction takes only public columns, so any path that
 * surfaces a PAT row to the API can't accidentally include the hash.
 */
export class PersonalAccessToken {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly last4: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: PersonalAccessTokenRow) {
    required(row.id, ENTITY, 'id');
    required(row.userId, ENTITY, 'userId');
    required(row.name, ENTITY, 'name');
    required(row.last4, ENTITY, 'last4');
    required(row.createdAt, ENTITY, 'createdAt');

    this.id = row.id;
    this.userId = row.userId;
    this.name = row.name;
    this.last4 = row.last4;
    this.lastUsedAt = row.lastUsedAt
      ? toISO(row.lastUsedAt, ENTITY, 'lastUsedAt')
      : null;
    this.expiresAt = row.expiresAt
      ? toISO(row.expiresAt, ENTITY, 'expiresAt')
      : null;
    this.revokedAt = row.revokedAt
      ? toISO(row.revokedAt, ENTITY, 'revokedAt')
      : null;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: PersonalAccessTokenRow): PersonalAccessToken {
    return new PersonalAccessToken(row);
  }
}
