import type { Knex } from 'knex';

/**
 * Slice 4 — project workflow assignment.
 *
 * (project, issue_type) → workflow. One row per pair, upserted via
 * setProjectWorkflow. ON DELETE RESTRICT against workflows so a
 * referenced workflow can't be deleted out from under a project — the
 * deleteWorkflow usecase translates the underlying constraint into a
 * 409 with a friendlier message.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('project_workflows', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    t.string('issue_type', 2).notNullable();
    t.uuid('workflow_id').notNullable().references('id').inTable('workflows').onDelete('RESTRICT');
    t.timestamps(true, true);

    t.unique(['project_id', 'issue_type']);
    t.index('project_id');
    t.index('workflow_id');
  });

  await knex.raw(`
    ALTER TABLE project_workflows
    ADD CONSTRAINT project_workflows_issue_type_chk
    CHECK (issue_type IN ('T', 'B', 'S', 'E'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('project_workflows');
}
