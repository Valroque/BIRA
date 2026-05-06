/**
 * Domain B — teams + team memberships.
 *
 * Teams are workspace-scoped flat groups of users. They carry no role
 * of their own (the role lives on the project-access grant, not on the
 * team) and they're not nested. The schema mirrors the FE fixture
 * `TEAMS` shape: `slug, name, description, color`. There is no
 * `letter` column — the FE uses the team avatar / icon, not an
 * uppercase initial like projects do.
 *
 * Team membership: `(team_id, user_id)` is unique; a user may belong
 * to multiple teams. We enforce the "team members must be active
 * workspace members" invariant in the service layer rather than via
 * a CHECK / trigger, so we can return a clean 400 from the API.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('teams', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('workspace_id')
      .notNullable()
      .references('id')
      .inTable('workspaces')
      .onDelete('CASCADE');
    t.string('slug', 64).notNullable();
    t.string('name', 255).notNullable();
    t.text('description').notNullable().defaultTo('');
    t.string('color', 16).notNullable();
    t.uuid('created_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);

    t.unique(['workspace_id', 'slug']);
    t.index(['workspace_id']);
  });

  await knex.schema.createTable('team_memberships', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('team_id').notNullable().references('id').inTable('teams').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamps(true, true);

    t.unique(['team_id', 'user_id']);
    t.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('team_memberships');
  await knex.schema.dropTableIfExists('teams');
}
