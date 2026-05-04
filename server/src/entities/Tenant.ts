import { required, toISO } from './utils.js';

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  plan: string;
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
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: TenantRow) {
    required(row.id, ENTITY, 'id');
    required(row.slug, ENTITY, 'slug');
    required(row.name, ENTITY, 'name');
    required(row.letter, ENTITY, 'letter');
    required(row.color, ENTITY, 'color');
    required(row.bg, ENTITY, 'bg');
    required(row.createdAt, ENTITY, 'createdAt');

    this.id = row.id;
    this.slug = row.slug;
    this.name = row.name;
    this.letter = row.letter;
    this.color = row.color;
    this.bg = row.bg;
    this.plan = row.plan || 'free';
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: TenantRow): Tenant {
    return new Tenant(row);
  }
}
