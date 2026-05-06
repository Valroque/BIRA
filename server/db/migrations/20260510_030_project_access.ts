/**
 * Domain C — project access (two-table design).
 *
 * Two grant tables, one for teams and one for explicit users:
 *   - `project_team_access` — `(project_id, team_id, role)`,
 *     role ∈ ('write', 'read'). Admin is intentionally excluded at
 *     the DB CHECK level — admin is never inherited via a team
 *     (per `.claude/rules/v1-constraints.md`). Defence in depth on
 *     top of the route-side Zod check.
 *   - `project_user_access` — `(project_id, user_id, role)`,
 *     role ∈ ('admin', 'write', 'read'). Explicit user grants can be
 *     admin (project-admin would be a separate v2 concept; for now
 *     this lets a workspace admin tag specific maintainers).
 *
 * Both tables CASCADE on `project_id` and on their respective parent
 * (team or user) so deleting a project / team / user automatically
 * frees up its access grants.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('project_team_access', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('project_id')
      .notNullable()
      .references('id')
      .inTable('projects')
      .onDelete('CASCADE');
    t.uuid('team_id').notNullable().references('id').inTable('teams').onDelete('CASCADE');
    t.string('role', 16).notNullable();
    t.timestamps(true, true);

    t.unique(['project_id', 'team_id']);
    t.index(['team_id']);
  });

  // Defence-in-depth: admin cannot be assigned to a team. Mirrors the
  // route-side Zod check in projectAccess.ts; even if a usecase is
  // wired wrong, the DB rejects.
  await knex.raw(`
    ALTER TABLE project_team_access
    ADD CONSTRAINT project_team_access_role_chk
    CHECK (role IN ('write', 'read'))
  `);

  await knex.schema.createTable('project_user_access', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('project_id')
      .notNullable()
      .references('id')
      .inTable('projects')
      .onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('role', 16).notNullable();
    t.timestamps(true, true);

    t.unique(['project_id', 'user_id']);
    t.index(['user_id']);
  });

  await knex.raw(`
    ALTER TABLE project_user_access
    ADD CONSTRAINT project_user_access_role_chk
    CHECK (role IN ('admin', 'write', 'read'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('project_user_access');
  await knex.schema.dropTableIfExists('project_team_access');
}
