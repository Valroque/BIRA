import { config as loadDotenv } from 'dotenv';
import knexStringcase from 'knex-stringcase';
import type { Knex } from 'knex';

// Load .env.<NODE_ENV> first (so it takes precedence), then .env as a
// fallback for shared values. NODE_ENV defaults to 'development' so a fresh
// clone with a .env.development file Just Works.
const env = process.env.NODE_ENV || 'development';
loadDotenv({ path: `.env.${env}` });
loadDotenv();

type ConnectionConfig =
  | string
  | {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
    };

function connection(envDb: string): ConnectionConfig {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || envDb,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };
}

const baseConfig: Knex.Config = {
  client: 'pg',
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './db/migrations',
    tableName: 'knex_migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
  seeds: {
    directory: './db/seeds',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
};

export const knexConfig: Record<string, Knex.Config> = {
  development: knexStringcase({
    ...baseConfig,
    connection: connection('bira_dev'),
  }),
  test: knexStringcase({
    ...baseConfig,
    pool: { min: 1, max: 3 },
    connection: connection('bira_test'),
  }),
  production: knexStringcase({
    ...baseConfig,
    connection: process.env.DATABASE_URL,
    pool: { min: 5, max: 30 },
  }),
};

export function configForEnv(forEnv = env): Knex.Config {
  const cfg = knexConfig[forEnv];
  if (!cfg) {
    throw new Error(`No knex config found for NODE_ENV='${forEnv}'`);
  }
  return cfg;
}
