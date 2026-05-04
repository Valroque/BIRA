import { required } from './utils.js';
import { EntityError } from '../lib/errors.js';
import { ROLES, type Role } from '../lib/constants.js';

export const RULE_TYPES = [
  'role',
  'assignee_only',
  'reporter_only',
  'required_fields',
  'not_self',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

/**
 * Discriminated union over `type`. `params` shape MUST match `type`.
 *
 *   role             → { role: 'admin' | 'write' | 'read' }
 *   assignee_only    → no params (stored as null)
 *   reporter_only    → no params (stored as null)
 *   required_fields  → { fields: string[] }
 *   not_self         → no params (stored as null)
 */
export type RuleParams =
  | { role: Role }
  | { fields: string[] }
  | null;

export interface WorkflowTransitionRuleRow {
  id: string;
  transitionId: string;
  type: RuleType;
  // jsonb — knex returns the parsed value, not a string
  params: unknown;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'WorkflowTransitionRule';

/**
 * Validate (and narrow) `params` against `type`. Throws EntityError
 * on mismatch. Centralised so create / update routes and the entity
 * constructor share the contract.
 */
export function validateRuleParams(type: RuleType, params: unknown): RuleParams {
  switch (type) {
    case 'role': {
      if (!params || typeof params !== 'object' || Array.isArray(params)) {
        throw new EntityError(
          `Rule type 'role' requires params { role: <admin|write|read> }`,
          ENTITY,
          'params'
        );
      }
      const role = (params as { role?: unknown }).role;
      if (typeof role !== 'string' || !ROLES.includes(role as Role)) {
        throw new EntityError(
          `Rule type 'role' has an invalid role '${String(role)}'`,
          ENTITY,
          'params'
        );
      }
      return { role: role as Role };
    }
    case 'required_fields': {
      if (!params || typeof params !== 'object' || Array.isArray(params)) {
        throw new EntityError(
          `Rule type 'required_fields' requires params { fields: string[] }`,
          ENTITY,
          'params'
        );
      }
      const fields = (params as { fields?: unknown }).fields;
      if (!Array.isArray(fields) || !fields.every((f) => typeof f === 'string' && f.length > 0)) {
        throw new EntityError(
          `Rule type 'required_fields' requires a non-empty string[] in fields`,
          ENTITY,
          'params'
        );
      }
      return { fields: fields as string[] };
    }
    case 'assignee_only':
    case 'reporter_only':
    case 'not_self':
      // params should be null/empty; coerce silently.
      return null;
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      throw new EntityError(`Unknown rule type '${String(type)}'`, ENTITY, 'type');
    }
  }
}

export class WorkflowTransitionRule {
  readonly id: string;
  readonly transitionId: string;
  readonly type: RuleType;
  readonly params: RuleParams;

  constructor(row: WorkflowTransitionRuleRow) {
    required(row.id, ENTITY, 'id');
    required(row.transitionId, ENTITY, 'transitionId');
    required(row.type, ENTITY, 'type');

    if (!RULE_TYPES.includes(row.type)) {
      throw new EntityError(`Invalid rule type '${row.type}'`, ENTITY, 'type');
    }

    this.id = row.id;
    this.transitionId = row.transitionId;
    this.type = row.type;
    this.params = validateRuleParams(row.type, row.params);
  }

  static fromRow(row: WorkflowTransitionRuleRow): WorkflowTransitionRule {
    return new WorkflowTransitionRule(row);
  }
}
