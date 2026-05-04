import bcrypt from 'bcryptjs';

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
