import type { Knex } from 'knex';

/**
 * Slice 3 — workflows.
 *
 * A workflow is workspace-scoped and identified by `slug` within that
 * workspace (so /:tenant/:workspace/workflows/:slug URLs are stable when
 * the FE wires up). Multiple workflows can exist for the same issue
 * type — the project_workflows table (slice 4) wires `(project,
 * issue_type) -> workflow`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workflows', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('workspace_id')
      .notNullable()
      .references('id')
      .inTable('workspaces')
      .onDelete('CASCADE');
    t.string('slug', 64).notNullable();
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.timestamps(true, true);

    t.unique(['workspace_id', 'slug']);
    t.index('workspace_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('workflows');
}
