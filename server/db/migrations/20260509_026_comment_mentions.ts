import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('comments', (t) => {
    t.jsonb('mentions').notNullable().defaultTo('[]');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('comments', (t) => {
    t.dropColumn('mentions');
  });
}
