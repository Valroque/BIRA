/**
 * Domain A — workspace member admin surface.
 *
 * Adds `status` + `last_seen_at` to `workspace_memberships` so the FE can
 * render the member directory with a state column ("Active", "Invited",
 * "Deactivated") and surface a recency hint without us paying for a
 * separate join. The status enum mirrors `tenant_memberships.status` so
 * the two tables stay in lockstep.
 *
 * Direct-add only — there is no separate `workspace_invites` table in v1.
 * `'invited'` is reserved for a future invite flow; today every row
 * lands as `'active'` (the membership service rejects adds for users
 * who aren't already active tenant members, so there's no orphan-add
 * vector that needs a pending state).
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('workspace_memberships', (t) => {
    t.string('status', 16).notNullable().defaultTo('active');
    t.timestamp('last_seen_at').nullable();
  });

  await knex.raw(`
    ALTER TABLE workspace_memberships
    ADD CONSTRAINT workspace_memberships_status_chk
    CHECK (status IN ('active', 'invited', 'deactivated'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    'ALTER TABLE workspace_memberships DROP CONSTRAINT IF EXISTS workspace_memberships_status_chk'
  );
  await knex.schema.alterTable('workspace_memberships', (t) => {
    t.dropColumn('last_seen_at');
    t.dropColumn('status');
  });
}
