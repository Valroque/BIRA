import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tenants', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('slug', 64).notNullable().unique();
    t.string('name', 255).notNullable();
    t.string('letter', 4).notNullable();
    t.string('color', 16).notNullable();
    t.string('bg', 16).notNullable();
    t.string('plan', 32).notNullable().defaultTo('free');
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenants');
}
