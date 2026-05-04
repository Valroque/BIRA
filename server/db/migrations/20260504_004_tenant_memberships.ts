import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tenant_memberships', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('role', 16).notNullable();
    t.string('status', 16).notNullable().defaultTo('active');
    t.timestamp('last_seen_at');
    t.timestamps(true, true);

    t.unique(['user_id', 'tenant_id']);
    t.index(['tenant_id']);
  });

  await knex.raw(`
    ALTER TABLE tenant_memberships
    ADD CONSTRAINT tenant_memberships_role_chk
    CHECK (role IN ('admin', 'write', 'read'))
  `);
  await knex.raw(`
    ALTER TABLE tenant_memberships
    ADD CONSTRAINT tenant_memberships_status_chk
    CHECK (status IN ('active', 'invited', 'deactivated'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenant_memberships');
}
