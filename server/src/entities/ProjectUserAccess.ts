import { required, toISO } from './utils.js';
import { ROLES, type Role } from '../lib/constants.js';
import { EntityError } from '../lib/errors.js';

export interface ProjectUserAccessRow {
  id: string;
  projectId: string;
  userId: string;
  role: Role;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'ProjectUserAccess';

export class ProjectUserAccess {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly role: Role;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: ProjectUserAccessRow) {
    required(row.id, ENTITY, 'id');
    required(row.projectId, ENTITY, 'projectId');
    required(row.userId, ENTITY, 'userId');
    required(row.role, ENTITY, 'role');
    required(row.createdAt, ENTITY, 'createdAt');
    if (!(ROLES as readonly string[]).includes(row.role)) {
      throw new EntityError(`Unknown project user-access role '${row.role}'`, ENTITY, 'role');
    }

    this.id = row.id;
    this.projectId = row.projectId;
    this.userId = row.userId;
    this.role = row.role;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: ProjectUserAccessRow): ProjectUserAccess {
    return new ProjectUserAccess(row);
  }
}
