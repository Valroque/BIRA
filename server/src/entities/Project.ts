import { required, toISO } from './utils.js';
import type { ProjectStatus } from '../lib/constants.js';

export interface ProjectRow {
  id: string;
  workspaceId: string;
  slug: string;
  key: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  description: string | null;
  status: ProjectStatus;
  createdByUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'Project';

export class Project {
  readonly id: string;
  readonly workspaceId: string;
  readonly slug: string;
  readonly key: string;
  readonly name: string;
  readonly letter: string;
  readonly color: string;
  readonly bg: string;
  readonly description: string;
  readonly status: ProjectStatus;
  readonly createdByUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: ProjectRow) {
    required(row.id, ENTITY, 'id');
    required(row.workspaceId, ENTITY, 'workspaceId');
    required(row.slug, ENTITY, 'slug');
    required(row.key, ENTITY, 'key');
    required(row.name, ENTITY, 'name');
    required(row.letter, ENTITY, 'letter');
    required(row.color, ENTITY, 'color');
    required(row.bg, ENTITY, 'bg');
    required(row.status, ENTITY, 'status');
    required(row.createdAt, ENTITY, 'createdAt');

    this.id = row.id;
    this.workspaceId = row.workspaceId;
    this.slug = row.slug;
    this.key = row.key;
    this.name = row.name;
    this.letter = row.letter;
    this.color = row.color;
    this.bg = row.bg;
    this.description = row.description ?? '';
    this.status = row.status;
    this.createdByUserId = row.createdByUserId ?? null;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: ProjectRow): Project {
    return new Project(row);
  }
}
