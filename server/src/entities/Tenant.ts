import { required, toISO } from './utils.js';
import { TENANT_STATUSES, type TenantStatus } from '../lib/constants.js';
import { EntityError } from '../lib/errors.js';

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  plan: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'Tenant';

export class Tenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly letter: string;
  readonly color: string;
  readonly bg: string;
  readonly plan: string;
  readonly status: TenantStatus;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: TenantRow) {
    required(row.id, ENTITY, 'id');
    required(row.slug, ENTITY, 'slug');
    required(row.name, ENTITY, 'name');
    required(row.letter, ENTITY, 'letter');
    required(row.color, ENTITY, 'color');
    required(row.bg, ENTITY, 'bg');
    required(row.status, ENTITY, 'status');
    required(row.createdAt, ENTITY, 'createdAt');

    if (!(TENANT_STATUSES as readonly string[]).includes(row.status)) {
      throw new EntityError(`Unknown tenant status '${row.status}'`, ENTITY, 'status');
    }

    this.id = row.id;
    this.slug = row.slug;
    this.name = row.name;
    this.letter = row.letter;
    this.color = row.color;
    this.bg = row.bg;
    this.plan = row.plan || 'free';
    this.status = row.status as TenantStatus;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: TenantRow): Tenant {
    return new Tenant(row);
  }
}
