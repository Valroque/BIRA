import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('workspaces', (t) => {
    t.string('status', 16).notNullable().defaultTo('active');
  });

  await knex.raw(`
    ALTER TABLE workspaces
    ADD CONSTRAINT workspaces_status_chk
    CHECK (status IN ('active', 'archived'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_status_chk');
  await knex.schema.alterTable('workspaces', (t) => {
    t.dropColumn('status');
  });
}
