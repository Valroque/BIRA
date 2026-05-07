import type { Knex } from 'knex';

/**
 * Milestones — project-level deadline annotations.
 *
 * Pure annotation: no link to issues, no completion flag. The mental model
 * is "did the date pass yet?" — `today > date` is overdue, today/future is
 * upcoming. The FE owns the overdue/upcoming render; the BE just stores
 * `(name, date)`.
 *
 * `workspace_id` AND `project_id` are both denormalised on the row to
 * mirror `issues`. The tenant chain runs through `workspaces.tenant_id`,
 * not the milestone row. Routes stay JOIN-free per the
 * "no-DB-JOINs-without-approval" rule.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('milestones', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('workspace_id')
      .notNullable()
      .references('id')
      .inTable('workspaces')
      .onDelete('CASCADE');
    t.uuid('project_id')
      .notNullable()
      .references('id')
      .inTable('projects')
      .onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.text('description').nullable();
    t.date('date').notNullable();
    t.timestamps(true, true);

    t.index('workspace_id');
    t.index('project_id');
  });

  await knex.raw(`
    ALTER TABLE milestones
    ADD CONSTRAINT milestones_name_chk
    CHECK (char_length(name) BETWEEN 1 AND 200)
  `);
  await knex.raw(`
    ALTER TABLE milestones
    ADD CONSTRAINT milestones_description_chk
    CHECK (description IS NULL OR char_length(description) <= 2000)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('milestones');
}
