import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(plainPassword, salt);
}

export async function comparePassword(
  candidate: string,
  hashed: string
): Promise<boolean> {
  return bcrypt.compare(candidate, hashed);
}

const TEMP_PWD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generates a 16-character temporary password from an unambiguous alphabet
 * (no 0/O/l/I/1). Used by the admin password-reset flow. The caller is
 * responsible for hashing before persistence and surfacing the plaintext
 * only once — never log it.
 */
export function generateTemporaryPassword(): string {
  const buf = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += TEMP_PWD_ALPHABET[buf[i] % TEMP_PWD_ALPHABET.length];
  }
  return out;
}
