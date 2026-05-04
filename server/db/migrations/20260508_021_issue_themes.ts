import type { Knex } from 'knex';

/**
 * Slice 7 — issue/theme join.
 *
 * Composite PK on (issue_id, theme_id) keeps duplicate links impossible.
 * Both FKs CASCADE so removing an issue or a theme cleans up the
 * membership rows automatically.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('issue_themes', (t) => {
    t.uuid('issue_id').notNullable().references('id').inTable('issues').onDelete('CASCADE');
    t.uuid('theme_id').notNullable().references('id').inTable('themes').onDelete('CASCADE');
    t.primary(['issue_id', 'theme_id']);
    t.index('theme_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('issue_themes');
}
