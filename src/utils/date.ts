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
