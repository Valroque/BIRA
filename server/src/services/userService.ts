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
  'is_active',
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
