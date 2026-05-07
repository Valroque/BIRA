import { required, toISO, formatDate } from './utils.js';
import { EntityError } from '../lib/errors.js';

export interface MilestoneRow {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string | null;
  date: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'Milestone';

/**
 * Project-level deadline annotation. Pure annotation: no link to issues,
 * no completed flag — `today > date` means overdue at the FE layer.
 *
 * `date` is rendered as YYYY-MM-DD (the column is `date`, not `timestamptz`).
 * Length / shape validation lives in the DB CHECK + the route's Zod
 * schema; entity stays a row mirror with `required()` invariants.
 */
export class Milestone {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string | null;
  readonly date: string; // YYYY-MM-DD
  readonly createdAt: string; // ISO
  readonly updatedAt: string | null; // ISO

  constructor(row: MilestoneRow) {
    required(row.id, ENTITY, 'id');
    required(row.workspaceId, ENTITY, 'workspaceId');
    required(row.projectId, ENTITY, 'projectId');
    required(row.name, ENTITY, 'name');
    required(row.date, ENTITY, 'date');
    required(row.createdAt, ENTITY, 'createdAt');

    this.id = row.id;
    this.workspaceId = row.workspaceId;
    this.projectId = row.projectId;
    this.name = row.name;
    this.description = row.description ?? null;
    // `date` is a NOT NULL column, but formatDate is permissive (returns
    // null on null input). Coerce defensively — a null formatDate result
    // here means a corrupt row, surface that as an entity error.
    const formatted = formatDate(row.date);
    if (formatted === null) {
      throw new EntityError('Milestone.date is not a valid date', ENTITY, 'date');
    }
    this.date = formatted;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: MilestoneRow): Milestone {
    return new Milestone(row);
  }
}
