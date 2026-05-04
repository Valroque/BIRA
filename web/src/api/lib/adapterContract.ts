/**
 * Adapter contract enforcement — the guardrails between BE wire shapes and FE entities.
 *
 * `requireField`: asserts a mandatory contract. Throws in dev so bugs surface
 *   immediately; in prod, logs + returns the caller-supplied fallback so a
 *   single bad record doesn't kill a whole list render.
 *
 * `expectField`:  asserts a nice-to-have field with a known-reasonable default.
 *   Never throws. Logs + returns fallback in every env.
 */

export interface ContractContext {
  /** Entity being adapted — e.g. 'Tenant', 'Workspace'. */
  entity: string;
  /** Field path being asserted — e.g. 'slug', 'workspace.status'. */
  field: string;
  /** Id of the record, for debugging. */
  id?: string;
}

export class AdapterContractError extends Error {
  readonly entity: string;
  readonly field: string;
  readonly recordId?: string;

  constructor(ctx: ContractContext) {
    super(
      `[adapter:${ctx.entity}] contract breach: "${ctx.field}" missing (id: ${ctx.id ?? 'unknown'})`
    );
    this.name = 'AdapterContractError';
    this.entity = ctx.entity;
    this.field = ctx.field;
    this.recordId = ctx.id;
  }
}

function isPresent<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined && v !== ('' as unknown as T);
}

function reportBreach(ctx: ContractContext): void {
  console.error(
    `[adapter:${ctx.entity}] contract breach: "${ctx.field}" missing (id: ${ctx.id ?? 'unknown'})`
  );
}

/**
 * Assert a contractually mandatory field. In dev, throws `AdapterContractError`
 * on breach so bugs surface immediately. In prod, reports the breach and returns
 * the fallback. Use for fields without which the entity is semantically broken.
 */
export function requireField<T>(value: T | null | undefined, fallback: T, ctx: ContractContext): T {
  if (isPresent(value)) return value;
  reportBreach(ctx);
  if (import.meta.env.DEV) {
    throw new AdapterContractError(ctx);
  }
  return fallback;
}

/**
 * Assert a field we'd like but can live without. Never throws. Reports the
 * breach and returns the fallback. Use for display fields where missing value
 * degrades rather than breaks the UI.
 */
export function expectField<T>(value: T | null | undefined, fallback: T, ctx: ContractContext): T {
  if (isPresent(value)) return value;
  reportBreach(ctx);
  return fallback;
}
