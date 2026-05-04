import { required, toISO } from './utils.js';

export interface ThemeRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'Theme';

export class Theme {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string | null;
  readonly color: string;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: ThemeRow) {
    required(row.id, ENTITY, 'id');
    required(row.workspaceId, ENTITY, 'workspaceId');
    required(row.name, ENTITY, 'name');
    required(row.color, ENTITY, 'color');
    required(row.createdAt, ENTITY, 'createdAt');

    this.id = row.id;
    this.workspaceId = row.workspaceId;
    this.name = row.name;
    this.description = row.description ?? null;
    this.color = row.color;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: ThemeRow): Theme {
    return new Theme(row);
  }
}
