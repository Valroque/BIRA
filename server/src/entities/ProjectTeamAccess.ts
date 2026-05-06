import { required, toISO } from './utils.js';
import type { Role } from '../lib/constants.js';
import { EntityError } from '../lib/errors.js';

export interface ProjectTeamAccessRow {
  id: string;
  projectId: string;
  teamId: string;
  role: Role;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'ProjectTeamAccess';

export class ProjectTeamAccess {
  readonly id: string;
  readonly projectId: string;
  readonly teamId: string;
  readonly role: Exclude<Role, 'admin'>;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: ProjectTeamAccessRow) {
    required(row.id, ENTITY, 'id');
    required(row.projectId, ENTITY, 'projectId');
    required(row.teamId, ENTITY, 'teamId');
    required(row.role, ENTITY, 'role');
    required(row.createdAt, ENTITY, 'createdAt');
    if (row.role !== 'write' && row.role !== 'read') {
      throw new EntityError(
        `Team-derived role must be 'write' or 'read' (got '${row.role}')`,
        ENTITY,
        'role'
      );
    }

    this.id = row.id;
    this.projectId = row.projectId;
    this.teamId = row.teamId;
    this.role = row.role as Exclude<Role, 'admin'>;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: ProjectTeamAccessRow): ProjectTeamAccess {
    return new ProjectTeamAccess(row);
  }
}
