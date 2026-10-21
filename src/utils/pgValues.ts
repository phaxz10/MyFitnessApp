// PGlite hands DATE and TIMESTAMP columns back as JS Date objects, not the
// strings our types claim. Normalise them at the query boundary:
// - DATE is parsed as UTC midnight, so read the calendar day in UTC. Local
//   formatting (date-fns `format`) shifts it a day west of UTC.
// - TIMESTAMP (no time zone) is parsed as local time. `String(date)` gives
//   "Tue May 20 2025 09:00:00 GMT…", which parseLocalTimestamp cannot read, so
//   serialise to ISO (Z-suffixed), which it parses as UTC.

/** DATE column value to 'yyyy-MM-dd'. */
export function pgDate(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val ?? '');
}

/** TIMESTAMP column value to a string parseLocalTimestamp understands. */
export function pgTimestamp(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  return String(val ?? '');
}
