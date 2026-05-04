import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tenants', (t) => {
    t.string('status', 16).notNullable().defaultTo('active');
  });

  await knex.raw(`
    ALTER TABLE tenants
    ADD CONSTRAINT tenants_status_chk
    CHECK (status IN ('active', 'deactivated'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_chk');
  await knex.schema.alterTable('tenants', (t) => {
    t.dropColumn('status');
  });
}
