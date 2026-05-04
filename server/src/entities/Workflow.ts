import { required, toISO } from './utils.js';

export interface WorkflowRow {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'Workflow';

export class Workflow {
  readonly id: string;
  readonly workspaceId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: WorkflowRow) {
    required(row.id, ENTITY, 'id');
    required(row.workspaceId, ENTITY, 'workspaceId');
    required(row.slug, ENTITY, 'slug');
    required(row.name, ENTITY, 'name');
    required(row.createdAt, ENTITY, 'createdAt');

    this.id = row.id;
    this.workspaceId = row.workspaceId;
    this.slug = row.slug;
    this.name = row.name;
    this.description = row.description ?? null;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: WorkflowRow): Workflow {
    return new Workflow(row);
  }
}
