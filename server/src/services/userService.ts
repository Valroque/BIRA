import { db } from '../db/knex.js';
import { User, type UserRow } from '../entities/User.js';

/**
 * Thin data-access service for the `users` table.
 * Owns: users.
 *
 * Note: passwordHash is NEVER returned from these helpers unless the function
 * name explicitly says so (e.g. `findByEmailWithHash`) — every other caller
 * gets a `User` entity which excludes it.
 */

interface UserRowWithHash extends UserRow {
  passwordHash: string;
}

const PUBLIC_COLUMNS = [
  'id',
  'email',
  'first_name',
  'last_name',
  'avatar',
  'phone',
  'is_active',
  'must_reset_password',
  'last_login',
  'created_at',
  'updated_at',
] as const;

export async function getById(id: string): Promise<User | null> {
  const row = (await db('users').where('id', id).select(PUBLIC_COLUMNS).first()) as
    | UserRow
    | undefined;
  return row ? User.fromRow(row) : null;
}

export async function findByEmail(email: string): Promise<User | null> {
  const row = (await db('users')
    .whereRaw('LOWER(email) = LOWER(?)', [email])
    .select(PUBLIC_COLUMNS)
    .first()) as UserRow | undefined;
  return row ? User.fromRow(row) : null;
}

/**
 * Returns the row WITH `passwordHash` for credential-checking. Use only in
 * the login usecase; never expose the hash to callers.
 */
export async function findByEmailWithHash(email: string): Promise<UserRowWithHash | null> {
  const row = (await db('users')
    .whereRaw('LOWER(email) = LOWER(?)', [email])
    .first()) as UserRowWithHash | undefined;
  return row ?? null;
}

/**
 * Returns the row WITH `passwordHash` looked up by id. Use only in flows
 * that need to verify credentials for a known user (e.g. self-driven
 * change-password). Never expose the hash to callers.
 */
export async function findByIdWithHash(id: string): Promise<UserRowWithHash | null> {
  const row = (await db('users').where('id', id).first()) as
    | UserRowWithHash
    | undefined;
  return row ?? null;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
}

export async function create(input: CreateUserInput): Promise<User> {
  const [row] = (await db('users')
    .insert({
      email: input.email,
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      avatar: input.avatar ?? null,
    })
    .returning(PUBLIC_COLUMNS)) as UserRow[];
  return User.fromRow(row);
}

export async function updateLastLogin(id: string): Promise<void> {
  await db('users').where('id', id).update({ lastLogin: new Date() });
}

export async function getByIds(ids: string[]): Promise<User[]> {
  if (!ids.length) return [];
  const rows = (await db('users')
    .whereIn('id', ids)
    .select(PUBLIC_COLUMNS)) as UserRow[];
  return rows.map(User.fromRow);
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  /** Caller MUST lowercase before passing — service does not normalise. */
  email?: string;
  phone?: string | null;
  avatar?: string | null;
}

export async function update(id: string, patch: UpdateUserInput): Promise<User | null> {
  if (Object.keys(patch).length === 0) return getById(id);
  const [row] = (await db('users')
    .where('id', id)
    .update({ ...patch, updatedAt: db.fn.now() })
    .returning(PUBLIC_COLUMNS)) as UserRow[];
  return row ? User.fromRow(row) : null;
}

/**
 * Set both `passwordHash` and `mustResetPassword` in a single UPDATE so the
 * two never drift apart — admin reset sets `mustReset: true`; the user's
 * own change-password flow sets `mustReset: false`.
 */
export async function setPassword(
  id: string,
  passwordHash: string,
  opts: { mustReset: boolean }
): Promise<void> {
  await db('users').where('id', id).update({
    passwordHash,
    mustResetPassword: opts.mustReset,
    updatedAt: db.fn.now(),
  });
}

/**
 * Flip a user's `isActive` flag. Deactivated users can't log in (login
 * usecase rejects with 401) and existing sessions fail on the next
 * request (auth middleware also checks the flag). Refresh-token paths
 * are blocked too. The user row is preserved — every FK that points
 * here uses SET NULL or stays valid, so historical assignees /
 * reporters / authors keep their attribution.
 */
export async function setActive(id: string, isActive: boolean): Promise<User | null> {
  const [row] = (await db('users')
    .where('id', id)
    .update({ isActive, updatedAt: db.fn.now() })
    .returning(PUBLIC_COLUMNS)) as UserRow[];
  return row ? User.fromRow(row) : null;
}
