import { add, type Duration } from 'date-fns';

/**
 * Helpers for the backend's compound duration strings, e.g. "1y", "52w3d", "8760h".
 * Units must appear in order (y, w, d, h, m, s) and at most once each.
 */

const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;
// The optional unit keeps every digit run a match, so the scan never backtracks through it.
const DURATION_PART_REGEX = /(\d+)([ywdhms])?/g;

type DurationUnit = 'y' | 'w' | 'd' | 'h' | 'm' | 's';

const UNIT_SECONDS: Record<DurationUnit, number> = {
  y: 365 * 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
  d: 24 * 60 * 60,
  h: 60 * 60,
  m: 60,
  s: 1,
};

const UNIT_FIELDS: Record<DurationUnit, keyof Duration> = {
  y: 'years', w: 'weeks', d: 'days', h: 'hours', m: 'minutes', s: 'seconds',
};

const UNIT_NAMES: Record<DurationUnit, string> = {
  y: 'year', w: 'week', d: 'day', h: 'hour', m: 'minute', s: 'second',
};

/** Each "<number><unit>" part of a duration string, in order. Digits without a unit are skipped. */
function durationParts(value: string): Array<[number, DurationUnit]> {
  const parts: Array<[number, DurationUnit]> = [];
  for (const [, digits, unit] of value.matchAll(DURATION_PART_REGEX)) {
    if (unit) parts.push([Number.parseInt(digits, 10), unit as DurationUnit]);
  }
  return parts;
}

/** Whether the string is well-formed (zero durations such as "0d" included). */
export function isValidDuration(value: string): boolean {
  return DURATION_REGEX.test(value);
}

/** Whether a well-formed duration adds up to zero, e.g. "0d" or "0y0s". */
export function isZeroDuration(value: string): boolean {
  return durationParts(value).every(([n]) => n === 0);
}

export function isValidPositiveDuration(value: string): boolean {
  return isValidDuration(value) && !isZeroDuration(value);
}

/** Total length in seconds (a year counts as 365 days), or null when the string is malformed. */
export function parseDurationToSeconds(value: string): number | null {
  if (!isValidDuration(value)) return null;
  return durationParts(value).reduce((total, [n, unit]) => total + n * UNIT_SECONDS[unit], 0);
}

/** date-fns Duration for the string, so calendar-aware maths (leap years, month lengths) stays exact. */
export function toDateFnsDuration(value: string): Duration {
  const duration: Duration = {};
  for (const [n, unit] of durationParts(value)) duration[UNIT_FIELDS[unit]] = n;
  return duration;
}

/** The instant the duration ends when started at `from`. */
export function addDuration(value: string, from: Date = new Date()): Date {
  return add(from, toDateFnsDuration(value));
}

/** "1y2d" → "1 year, 2 days" */
export function formatDuration(value: string): string {
  return durationParts(value)
    .map(([n, unit]) => `${n} ${UNIT_NAMES[unit]}${n === 1 ? '' : 's'}`)
    .join(', ');
}
