import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('first_name', 128).notNullable();
    t.string('last_name', 128).notNullable();
    t.string('avatar', 512);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('last_login');
    t.timestamps(true, true);

    t.index(['is_active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
