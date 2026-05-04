import type { Knex } from 'knex';

/**
 * Slice 7 — themes.
 *
 * Themes are an orthogonal grouping entity (workspace-scoped, flat,
 * many-to-many with issues). See `.claude/rules/v1-constraints.md`
 * "Themes are an orthogonal grouping entity".
 *
 * Names are unique per workspace for sane UX in the picker — two
 * themes called "Q4" in the same workspace would be confusing.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('themes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('workspace_id')
      .notNullable()
      .references('id')
      .inTable('workspaces')
      .onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.string('color', 16).notNullable().defaultTo('slate');
    t.timestamps(true, true);

    t.unique(['workspace_id', 'name']);
    t.index('workspace_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('themes');
}
