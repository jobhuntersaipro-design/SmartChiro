/**
 * Calendar-date keys ("YYYY-MM-DD") ↔ the browser-local Date objects the date
 * picker works with. The key is a clinic calendar day; the local Date is only
 * a vehicle for react-day-picker, so the visitor's time zone plays no part.
 */

const pad2 = (n: number) => String(n).padStart(2, "0");

export function keyToLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function localDateToKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "YYYY-MM" of a local Date. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Tuesday, 29 September 2026" for a key. */
export function longDateLabel(key: string): string {
  const d = keyToLocalDate(key);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
