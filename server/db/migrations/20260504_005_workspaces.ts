import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workspaces', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('slug', 64).notNullable();
    t.string('name', 255).notNullable();
    t.string('letter', 4).notNullable();
    t.string('color', 16).notNullable();
    t.string('bg', 16).notNullable();
    t.timestamps(true, true);

    t.unique(['tenant_id', 'slug']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('workspaces');
}
