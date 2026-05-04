import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('projects', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('workspace_id').notNullable().references('id').inTable('workspaces').onDelete('CASCADE');
    t.string('slug', 64).notNullable();
    t.string('key', 8).notNullable();
    t.string('name', 255).notNullable();
    t.string('letter', 4).notNullable();
    t.string('color', 16).notNullable();
    t.string('bg', 16).notNullable();
    t.text('description').notNullable().defaultTo('');
    t.string('status', 16).notNullable().defaultTo('active');
    t.uuid('created_by_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);

    t.unique(['workspace_id', 'slug']);
    t.unique(['workspace_id', 'key']);
  });

  await knex.raw(`
    ALTER TABLE projects
    ADD CONSTRAINT projects_status_chk
    CHECK (status IN ('active', 'archived'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('projects');
}
