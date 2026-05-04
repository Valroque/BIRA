import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('issues', (t) => {
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
    // Human-readable id like 'CMT-241'. Unique within a workspace so the FE
    // URL `/:tenant/:workspace/:project/issue/:key` can be looked up without
    // ambiguity (the project segment in the URL is presentational).
    t.string('key', 32).notNullable();
    // Numeric portion (241 in 'CMT-241'). Allocated atomically per project
    // via projects.next_issue_number — see createIssue usecase.
    t.integer('seq').notNullable();
    t.string('type', 2).notNullable();
    t.string('status', 16).notNullable();
    t.string('priority', 8).notNullable().defaultTo('none');
    t.string('title', 500).notNullable();
    t.text('description').nullable();
    t.specificType('labels', 'text[]').notNullable().defaultTo(knex.raw("'{}'::text[]"));
    // Nullable so a deleted user (when delete is ever wired up) doesn't
    // cascade-blow away their reported / assigned issues. v1 doesn't delete
    // users but the FK is set up defensively.
    t.uuid('assignee_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.uuid('reporter_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);

    t.unique(['workspace_id', 'key']);
    t.unique(['project_id', 'seq']);
    t.index('workspace_id');
    t.index('project_id');
    t.index('assignee_user_id');
  });

  await knex.raw(`
    ALTER TABLE issues
    ADD CONSTRAINT issues_type_chk
    CHECK (type IN ('T', 'B', 'S', 'E'))
  `);
  await knex.raw(`
    ALTER TABLE issues
    ADD CONSTRAINT issues_status_chk
    CHECK (status IN ('backlog', 'todo', 'in-progress', 'in-review', 'done', 'canceled'))
  `);
  await knex.raw(`
    ALTER TABLE issues
    ADD CONSTRAINT issues_priority_chk
    CHECK (priority IN ('urgent', 'high', 'med', 'low', 'none'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('issues');
}
