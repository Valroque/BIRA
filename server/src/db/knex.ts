import knexFactory from 'knex';
import type { Knex } from 'knex';
import { configForEnv } from '../config/database.js';

export const db: Knex = knexFactory(configForEnv());

export async function disconnectDB(): Promise<void> {
  await db.destroy();
}
