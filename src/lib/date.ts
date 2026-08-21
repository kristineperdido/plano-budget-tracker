/**
 * Everything in this app is anchored to the Manila calendar day, never the
 * browser's zone and never the database's UTC clock. `spent_on` is a bare
 * `date` column, so if we derived "today" from UTC the buffer would flip to the
 * next day at 4pm local time.
 */
export const TZ = 'Asia/Manila';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Manila calendar day as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return ymdFormatter.format(now);
}

/** Parse YYYY-MM-DD into its numeric parts without touching Date's zone logic. */
export function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function daysInMonth(iso: string): number {
  const { y, m } = parseISO(iso);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** First day of the month containing `iso`. */
export function monthStart(iso: string): string {
  const { y, m } = parseISO(iso);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** Shift an ISO day by N days, staying purely on the calendar. */
export function addDays(iso: string, delta: number): string {
  const { y, m, d } = parseISO(iso);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(
    t.getUTCDate(),
  ).padStart(2, '0')}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function weekdayOf(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function monthNameOf(iso: string): string {
  return MONTHS[parseISO(iso).m - 1];
}

/** "Mon 20 Aug" — compact, for the recent-days ledger. */
export function shortDate(iso: string): string {
  const { d } = parseISO(iso);
  return `${weekdayOf(iso)} ${d} ${monthNameOf(iso).slice(0, 3)}`;
}

/** "Today" / "Yesterday" / "Mon 18 Aug", relative to the Manila day. */
export function relativeDate(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return shortDate(iso);
}

/**
 * Which month of the timeline a date falls in, counting from `startMonth`
 * (YYYY-MM). Negative before the plan begins. Month arithmetic only — the
 * day-of-month is irrelevant, so this is safe across the Manila offset.
 */
export function monthIndexOf(startMonth: string, iso: string): number {
  const [sy, sm] = startMonth.split('-').map(Number);
  const { y, m } = parseISO(iso);
  return (y - sy) * 12 + (m - sm);
}
