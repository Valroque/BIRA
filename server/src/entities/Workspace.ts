import { required, toISO } from './utils.js';
import { WORKSPACE_STATUSES, type WorkspaceStatus } from '../lib/constants.js';
import { EntityError } from '../lib/errors.js';

export interface WorkspaceRow {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'Workspace';

export class Workspace {
  readonly id: string;
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly letter: string;
  readonly color: string;
  readonly bg: string;
  readonly status: WorkspaceStatus;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: WorkspaceRow) {
    required(row.id, ENTITY, 'id');
    required(row.tenantId, ENTITY, 'tenantId');
    required(row.slug, ENTITY, 'slug');
    required(row.name, ENTITY, 'name');
    required(row.letter, ENTITY, 'letter');
    required(row.color, ENTITY, 'color');
    required(row.bg, ENTITY, 'bg');
    required(row.status, ENTITY, 'status');
    required(row.createdAt, ENTITY, 'createdAt');

    if (!(WORKSPACE_STATUSES as readonly string[]).includes(row.status)) {
      throw new EntityError(`Unknown workspace status '${row.status}'`, ENTITY, 'status');
    }

    this.id = row.id;
    this.tenantId = row.tenantId;
    this.slug = row.slug;
    this.name = row.name;
    this.letter = row.letter;
    this.color = row.color;
    this.bg = row.bg;
    this.status = row.status as WorkspaceStatus;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: WorkspaceRow): Workspace {
    return new Workspace(row);
  }
}
