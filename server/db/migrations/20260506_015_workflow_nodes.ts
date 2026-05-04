import type { Knex } from 'knex';

/**
 * Slice 3 — workflow nodes.
 *
 * Each node attaches a layout coordinate to a status that participates
 * in this workflow. status_id is checked against the closed STATUSES
 * enum at DB level so a hand-crafted insert can't introduce a status
 * the app code doesn't know about.
 *
 * `is_initial` / `is_terminal` are layout / semantic markers — only one
 * initial state per workflow is enforced at the usecase level (cheaper
 * than a partial unique index, easier to phrase the error).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workflow_nodes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('workflow_id')
      .notNullable()
      .references('id')
      .inTable('workflows')
      .onDelete('CASCADE');
    t.string('status_id', 16).notNullable();
    t.integer('x').notNullable().defaultTo(0);
    t.integer('y').notNullable().defaultTo(0);
    t.boolean('is_initial').notNullable().defaultTo(false);
    t.boolean('is_terminal').notNullable().defaultTo(false);

    t.unique(['workflow_id', 'status_id']);
    t.index('workflow_id');
  });

  await knex.raw(`
    ALTER TABLE workflow_nodes
    ADD CONSTRAINT workflow_nodes_status_chk
    CHECK (status_id IN ('backlog', 'todo', 'in-progress', 'in-review', 'done', 'canceled'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('workflow_nodes');
}
