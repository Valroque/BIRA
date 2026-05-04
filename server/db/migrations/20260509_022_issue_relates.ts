import type { Knex } from 'knex';

/**
 * Slice 8 — symmetric "relates" links between issues.
 *
 * Stored canonicalised: `a_id < b_id` so the same pair only ever has
 * one row regardless of insertion direction. The service layer enforces
 * this on insert; a CHECK at the DB level catches data corruption.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('issue_relates', (t) => {
    t.uuid('a_id').notNullable().references('id').inTable('issues').onDelete('CASCADE');
    t.uuid('b_id').notNullable().references('id').inTable('issues').onDelete('CASCADE');
    t.primary(['a_id', 'b_id']);
    t.index('b_id');
  });

  await knex.raw(`
    ALTER TABLE issue_relates
    ADD CONSTRAINT issue_relates_canonical_chk
    CHECK (a_id < b_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('issue_relates');
}
