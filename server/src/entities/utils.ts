import { EntityError } from '../lib/errors.js';

export function required<T>(value: T, entity: string, field: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined || value === '') {
    throw new EntityError(`${entity}.${field} is required`, entity, field);
  }
}

export function toISO(value: Date | string, entity: string, field: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new EntityError(`${entity}.${field} is an invalid Date`, entity, field);
    }
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new EntityError(`${entity}.${field} is not a valid date`, entity, field);
  }
  return parsed.toISOString();
}
