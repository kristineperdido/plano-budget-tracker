import { monthOfIndex } from './date';
import type { Config, Phase } from './config';

/** Where a phase sits on the calendar, and how far through it you are. */
export type PhaseSpan = {
  phase: Phase;
  /** Index of its first month within the plan. */
  from: number;
  /** Index of its last month, inclusive. */
  to: number;
  firstMonth: string;
  lastMonth: string;
  /** Months elapsed within this phase, or null when it hasn't started. */
  elapsed: number | null;
};

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Sep–Oct 2026", or "Sep 2026 – Feb 2027" when it straddles a year. */
export function spanLabel(span: PhaseSpan): string {
  const fmt = (m: string) => {
    const [y, mm] = m.split('-').map(Number);
    return { name: MONTH_NAMES[mm - 1], year: y };
  };
  const a = fmt(span.firstMonth);
  const b = fmt(span.lastMonth);
  if (span.firstMonth === span.lastMonth) return `${a.name} ${a.year}`;
  if (a.year === b.year) return `${a.name}–${b.name} ${a.year}`;
  return `${a.name} ${a.year} – ${b.name} ${b.year}`;
}

/** Lay the phases out along the calendar, given where the plan starts. */
export function phaseSpans(config: Config, currentMonth: number): PhaseSpan[] {
  const out: PhaseSpan[] = [];
  let offset = 0;
  for (const phase of config.phases) {
    const from = offset;
    const to = offset + phase.months - 1;
    out.push({
      phase,
      from,
      to,
      firstMonth: monthOfIndex(config.startMonth, from),
      lastMonth: monthOfIndex(config.startMonth, to),
      elapsed:
        currentMonth < from ? null : Math.min(currentMonth - from + 1, phase.months),
    });
    offset += phase.months;
  }
  return out;
}
