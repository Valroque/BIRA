import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workspace_memberships', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('workspace_id').notNullable().references('id').inTable('workspaces').onDelete('CASCADE');
    t.string('role', 16).notNullable();
    t.timestamps(true, true);

    t.unique(['user_id', 'workspace_id']);
    t.index(['workspace_id']);
  });

  await knex.raw(`
    ALTER TABLE workspace_memberships
    ADD CONSTRAINT workspace_memberships_role_chk
    CHECK (role IN ('admin', 'write', 'read'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('workspace_memberships');
}
