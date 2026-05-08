import type { Knex } from 'knex';

/**
 * Personal access tokens — Bearer credentials a user can mint as an
 * alternative to email/password login. Targeted at headless / scheduled
 * agents (notably the BIRA MCP server) so credentials never have to flow
 * through chat.
 *
 * Tokens carry only `user_id`. Tenant / workspace scoping is unchanged —
 * the existing tenant/workspace middleware still runs on every request,
 * regardless of whether the bearer is a JWT or a PAT. The shape of
 * `req.user` is identical between the two paths so downstream handlers
 * see a uniform identity.
 *
 * Hashing: SHA-256, NOT bcrypt. PATs carry 256 bits of entropy
 * (`crypto.randomBytes(32)`) so there's no offline-grinding pressure to
 * defend against. Lookup is a single indexed equality on `token_hash`,
 * unlike password verification which fans out by email. Matches GitHub's
 * public design for `ghp_…` tokens.
 *
 * `last4` is the last 4 chars of the plaintext, persisted purely so the
 * UI list can show `bira_pat_…aZ7q` without surfacing the secret. Not
 * security-relevant; do NOT treat it as additional entropy.
 *
 * Uniqueness:
 *   - `token_hash` is globally unique — any two PATs hashing to the same
 *     value would be a collision (cosmically improbable with 256 bits)
 *     or a duplicate insert.
 *   - `(user_id, name)` is unique among NON-revoked rows, so a user can
 *     reuse the name "ci-bot" after revoking the previous one without
 *     hitting a uniqueness violation. Revoked rows stay around as audit
 *     trail.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('personal_access_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    t.string('name', 64).notNullable();
    t.string('token_hash', 64).notNullable().unique();
    t.string('last4', 4).notNullable();
    t.timestamp('last_used_at', { useTz: true }).nullable();
    t.timestamp('expires_at', { useTz: true }).nullable();
    t.timestamp('revoked_at', { useTz: true }).nullable();
    t.timestamps(true, true);

    t.index('user_id');
  });

  await knex.raw(`
    ALTER TABLE personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_name_chk
    CHECK (char_length(name) BETWEEN 1 AND 64)
  `);

  // (user_id, name) is unique among active (non-revoked) rows only —
  // letting a user reuse the same name after revoking the previous PAT.
  await knex.raw(`
    CREATE UNIQUE INDEX personal_access_tokens_user_name_active_uq
    ON personal_access_tokens(user_id, name)
    WHERE revoked_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('personal_access_tokens');
}
