/**
 * Team-on-Issue — slice 1.
 *
 * Adds `issues.team_id` as a nullable FK to `teams.id`. Sits alongside
 * the existing `assignee_user_id`; the two are **mutually exclusive at
 * the usecase layer** — at most one is non-null per issue. Both being
 * null is allowed (issue lands in the Planner's Unscheduled rail).
 *
 * No DB CHECK constraint. The mutual-exclusion rule lives in
 * `createIssue` / `updateIssue`, which already validate input shape;
 * a CHECK would make rollback awkward and duplicate the usecase guard.
 *
 * On team delete we SET NULL — same posture as `assignee_user_id` for
 * deleted users — so removing a team doesn't cascade-blow away its
 * issues. The issue lands in the Unscheduled rail until reassigned.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('issues', (t) => {
    t.uuid('team_id')
      .nullable()
      .references('id')
      .inTable('teams')
      .onDelete('SET NULL');
    t.index(['workspace_id', 'team_id'], 'issues_workspace_team_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('issues', (t) => {
    t.dropIndex(['workspace_id', 'team_id'], 'issues_workspace_team_idx');
    t.dropColumn('team_id');
  });
}
