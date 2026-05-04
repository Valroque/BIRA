import { required, toISO } from './utils.js';

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  phone: string | null;
  isActive: boolean;
  mustResetPassword: boolean;
  lastLogin: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'User';

export class User {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly avatar: string | null;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly mustResetPassword: boolean;
  readonly lastLogin: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: Omit<UserRow, 'passwordHash'>) {
    required(row.id, ENTITY, 'id');
    required(row.email, ENTITY, 'email');
    required(row.firstName, ENTITY, 'firstName');
    required(row.lastName, ENTITY, 'lastName');
    required(row.createdAt, ENTITY, 'createdAt');

    this.id = row.id;
    this.email = row.email;
    this.firstName = row.firstName;
    this.lastName = row.lastName;
    this.avatar = row.avatar ?? null;
    this.phone = row.phone ?? null;
    this.isActive = row.isActive;
    // `mustResetPassword` is non-null with a DB default of false; coerce
    // defensively for older rows that predate the column.
    this.mustResetPassword = row.mustResetPassword ?? false;
    this.lastLogin = row.lastLogin ? toISO(row.lastLogin, ENTITY, 'lastLogin') : null;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  get displayName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  static fromRow(row: UserRow): User {
    return new User(row);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      avatar: this.avatar,
      phone: this.phone,
      isActive: this.isActive,
      mustResetPassword: this.mustResetPassword,
      lastLogin: this.lastLogin,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      displayName: this.displayName,
    };
  }
}
