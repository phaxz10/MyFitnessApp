import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  subDays,
  isValid,
} from 'date-fns';

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d');
}

export function formatDayOfWeek(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'EEEE');
}

export function getToday(): string {
  return formatDate(new Date());
}

export function getWeekRange(date: Date = new Date()): {
  start: Date;
  end: Date;
} {
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }), // Monday
    end: endOfWeek(date, { weekStartsOn: 1 }),
  };
}

export function getLast7Days(): string[] {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    dates.push(formatDate(subDays(new Date(), i)));
  }
  return dates;
}

export function getDayOfWeekNumber(date: Date = new Date()): number {
  // Returns 0 for Sunday, 1 for Monday, etc.
  return date.getDay();
}

export function isValidDate(dateString: string): boolean {
  const date = parseISO(dateString);
  return isValid(date);
}

export function daysBetween(date1: string, date2: string): number {
  const d1 = parseISO(date1);
  const d2 = parseISO(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Gets the current local timestamp as an ISO string WITHOUT the 'Z' suffix.
 * Use this when storing timestamps in PostgreSQL TIMESTAMP (without timezone) columns.
 *
 * Why: PostgreSQL TIMESTAMP strips timezone info. If we store UTC time (with 'Z'),
 * when read back, JS parses it as local time, causing timezone offset errors.
 * By storing local time without 'Z', the round-trip is consistent.
 *
 * @returns ISO timestamp string in local time (e.g., "2026-01-08T15:30:00.000")
 */
export function getLocalTimestamp(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, -1); // Remove the 'Z' suffix
}

/**
 * Gets today's date as a string in 'yyyy-MM-dd' format, using local timezone.
 * This is the preferred way to get today's date for database storage/comparison.
 *
 * @returns Date string (e.g., "2026-01-08")
 */
export function getLocalDateString(): string {
  return getLocalTimestamp().split('T')[0];
}

/**
 * Parses a timestamp from the database (stored without timezone)
 * and returns a Date object in local time.
 *
 * Use this when reading timestamps from PostgreSQL TIMESTAMP columns
 * to ensure consistent interpretation.
 *
 * @param timestamp - Timestamp string or Date object from database
 * @returns Date object representing the local time
 */
export function parseLocalTimestamp(timestamp: string | Date): Date {
  // If already a Date object, return as-is
  if (timestamp instanceof Date) {
    return timestamp;
  }
  // If the timestamp has a 'Z' suffix, it's UTC - parse normally
  if (timestamp.endsWith('Z')) {
    return new Date(timestamp);
  }
  // Replace space with 'T' if needed (PostgreSQL format) and parse as local
  const normalized = timestamp.replace(' ', 'T');
  // Parse as local time by NOT adding 'Z'
  return new Date(normalized);
}

/**
 * Calculates the elapsed time in milliseconds from a stored timestamp to now.
 * Handles timestamps stored in local time (without timezone suffix).
 *
 * @param timestamp - Timestamp string or Date object from database
 * @returns Elapsed time in milliseconds
 */
export function getElapsedMs(timestamp: string | Date): number {
  const startTime = parseLocalTimestamp(timestamp);
  return Date.now() - startTime.getTime();
}

/**
 * Checks if a date string represents today (local timezone).
 *
 * @param dateString - Date string in 'yyyy-MM-dd' format
 * @returns true if the date is today
 */
export function isToday(dateString: string): boolean {
  return dateString === getLocalDateString();
}

/**
 * Checks if a date string represents yesterday (local timezone).
 *
 * @param dateString - Date string in 'yyyy-MM-dd' format
 * @returns true if the date is yesterday
 */
export function isYesterday(dateString: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateString === formatDate(yesterday);
}

/**
 * Gets a date N days ago as a string in 'yyyy-MM-dd' format.
 *
 * @param days - Number of days ago
 * @returns Date string (e.g., "2026-01-01")
 */
export function getDaysAgo(days: number): string {
  return formatDate(subDays(new Date(), days));
}
