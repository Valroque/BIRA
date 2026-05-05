import { config as loadDotenv } from 'dotenv';
import { afterAll, beforeEach } from 'vitest';

// IMPORTANT: dotenv has to be loaded BEFORE we import anything from src/
// because src/config/database.ts reads env vars at module-load time and
// `src/db/knex.ts` then snapshots the result. Vitest may inherit a NODE_ENV
// from the parent shell ('test' or otherwise) — we force it here so the
// test env file is the one that wins, and we load .env.test explicitly so
// the cwd-relative load in src/config/database.ts doesn't matter.
process.env.NODE_ENV = 'test';
loadDotenv({ path: '.env.test' });

// Now safe to import the app DB singleton.
const { db } = await import('../src/db/knex.js');

// Tables we wipe between tests. Keep this in dependency order (children
// before parents) just so the TRUNCATE error messages are readable; the
// CASCADE makes the order strictly unnecessary.
const TABLES = [
  'comments',
  'file_blobs',
  'files',
  'issues',
  'projects',
  'workspace_memberships',
  'workspaces',
  'tenant_memberships',
  'tenants',
  'users',
];

export async function truncateAll(): Promise<void> {
  await db.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.destroy();
});
