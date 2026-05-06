import { required, toISO } from './utils.js';

export interface TeamRow {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  createdByUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'Team';

export class Team {
  readonly id: string;
  readonly workspaceId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly color: string;
  readonly createdByUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: TeamRow) {
    required(row.id, ENTITY, 'id');
    required(row.workspaceId, ENTITY, 'workspaceId');
    required(row.slug, ENTITY, 'slug');
    required(row.name, ENTITY, 'name');
    required(row.color, ENTITY, 'color');
    required(row.createdAt, ENTITY, 'createdAt');

    this.id = row.id;
    this.workspaceId = row.workspaceId;
    this.slug = row.slug;
    this.name = row.name;
    this.description = row.description ?? '';
    this.color = row.color;
    this.createdByUserId = row.createdByUserId ?? null;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: TeamRow): Team {
    return new Team(row);
  }
}
