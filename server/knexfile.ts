// Re-export so the Knex CLI (`knex --knexfile knexfile.ts`) and the runtime
// app (which imports from src/config/database.ts) share one source of truth.
import { knexConfig } from './src/config/database.js';

export default knexConfig;
