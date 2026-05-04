import type { Knex } from 'knex';

/**
 * Slice 6 — schedules + estimates on issues.
 *
 *   start_date / end_date are stored as `date` (no time component).
 *   Type-gating (Tasks/Bugs only) lives at the usecase layer, not at
 *   the DB level — Stories/Epics could legitimately need to land
 *   here if the rules ever change, and DB-level CHECKs are awkward
 *   to evolve in v1.
 *
 *   estimate is in "points"; nullable on Bugs / hidden on Stories &
 *   Epics. Same usecase-level gating as dates.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('issues', (t) => {
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.integer('estimate').nullable();
  });

  await knex.raw(`
    ALTER TABLE issues
    ADD CONSTRAINT issues_dates_chk
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
  `);
  await knex.raw(`
    ALTER TABLE issues
    ADD CONSTRAINT issues_estimate_chk
    CHECK (estimate IS NULL OR estimate >= 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_dates_chk');
  await knex.raw('ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_estimate_chk');
  await knex.schema.alterTable('issues', (t) => {
    t.dropColumn('start_date');
    t.dropColumn('end_date');
    t.dropColumn('estimate');
  });
}
