import type { Knex } from 'knex';

/**
 * Slice 5 — workflow transition rules.
 *
 * Closed enum of five rule types — see
 * `.claude/rules/v1-constraints.md`. `params` is jsonb whose shape is
 * discriminated by `type` (validated at the entity layer):
 *   role             → { role: 'admin'|'write'|'read' }
 *   assignee_only    → null / {}
 *   reporter_only    → null / {}
 *   required_fields  → { fields: string[] }
 *   not_self         → null / {}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workflow_transition_rules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('transition_id')
      .notNullable()
      .references('id')
      .inTable('workflow_transitions')
      .onDelete('CASCADE');
    t.string('type', 32).notNullable();
    t.jsonb('params').nullable();
    t.timestamps(true, true);

    t.index('transition_id');
  });

  await knex.raw(`
    ALTER TABLE workflow_transition_rules
    ADD CONSTRAINT workflow_transition_rules_type_chk
    CHECK (type IN ('role', 'assignee_only', 'reporter_only', 'required_fields', 'not_self'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('workflow_transition_rules');
}
