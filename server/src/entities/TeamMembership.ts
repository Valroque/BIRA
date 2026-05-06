import { required, toISO } from './utils.js';

export interface TeamMembershipRow {
  id: string;
  teamId: string;
  userId: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'TeamMembership';

export class TeamMembership {
  readonly id: string;
  readonly teamId: string;
  readonly userId: string;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: TeamMembershipRow) {
    required(row.id, ENTITY, 'id');
    required(row.teamId, ENTITY, 'teamId');
    required(row.userId, ENTITY, 'userId');
    required(row.createdAt, ENTITY, 'createdAt');

    this.id = row.id;
    this.teamId = row.teamId;
    this.userId = row.userId;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: TeamMembershipRow): TeamMembership {
    return new TeamMembership(row);
  }
}
