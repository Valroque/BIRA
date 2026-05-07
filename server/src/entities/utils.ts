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

/**
 * Format a `date`-typed pg column as `YYYY-MM-DD`. Knex returns these
 * as `Date` objects under most configurations.
 *
 * **Why local components, not UTC**: pg's `date` type has no timezone.
 * Node's pg driver hydrates it to a `Date` at LOCAL midnight on that
 * calendar day. Calling `getUTCFullYear()` etc. on that Date in any
 * non-UTC timezone east of UTC silently shifts the day backward (e.g.
 * `2026-05-28` stored, retrieved as `Thu May 28 2026 00:00:00 GMT+0530`,
 * `getUTCDate()` returns 27). Using the LOCAL accessors gives back the
 * calendar day the column actually holds.
 *
 * Returns null for null/undefined so entities can pipe a nullable column
 * straight through.
 */
export function formatDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Already a string. If it includes a 'T' it's an ISO datetime — slice
  // to the date portion. Otherwise it's already YYYY-MM-DD.
  return value.length >= 10 ? value.slice(0, 10) : value;
}
