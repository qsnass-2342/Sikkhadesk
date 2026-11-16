import type { Timestamp } from 'firebase/firestore';

export function toMillis(
  value: Timestamp | Date | string | number | null | undefined
): number {
  if (!value) return Date.now(); // Newly created local docs with pending serverTimestamp sort first
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis();
  }
  return 0;
}

export function sortNewestFirst<T>(
  list: T[],
  getDate: (item: T) => Timestamp | Date | string | number | null | undefined
): T[] {
  return [...list].sort((a, b) => toMillis(getDate(b)) - toMillis(getDate(a)));
}
