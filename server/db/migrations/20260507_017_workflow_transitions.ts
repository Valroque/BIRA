import type { Knex } from 'knex';

/**
 * Slice 5 — workflow transitions.
 *
 * A directed edge between two workflow nodes. Cycles are intentional —
 * reopen / request-changes are back-edges. No unique constraint on
 * (workflow_id, from_node_id, to_node_id): parallel edges aren't useful
 * but the data model shouldn't forbid them; the editor can dedupe.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workflow_transitions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('workflow_id')
      .notNullable()
      .references('id')
      .inTable('workflows')
      .onDelete('CASCADE');
    t.uuid('from_node_id')
      .notNullable()
      .references('id')
      .inTable('workflow_nodes')
      .onDelete('CASCADE');
    t.uuid('to_node_id')
      .notNullable()
      .references('id')
      .inTable('workflow_nodes')
      .onDelete('CASCADE');
    t.string('label', 64).nullable();
    t.boolean('dashed').notNullable().defaultTo(false);
    t.timestamps(true, true);

    t.index('workflow_id');
    t.index('from_node_id');
    t.index('to_node_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('workflow_transitions');
}
