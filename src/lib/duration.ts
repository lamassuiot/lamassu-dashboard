/**
 * Helpers for the backend's compound duration strings, e.g. "1y", "52w3d", "8760h".
 * Units must appear in order (y, w, d, h, m, s) and at most once each.
 *
 * Units are fixed lengths, matching the backend's TimeDuration (core/pkg/models/timeduration.go):
 * a year is 52 weeks (364 days), not a calendar year, and a day is always 24 hours.
 */

const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;
// The optional unit keeps every digit run a match, so the scan never backtracks through it.
const DURATION_PART_REGEX = /(\d+)([ywdhms])?/g;

type DurationUnit = 'y' | 'w' | 'd' | 'h' | 'm' | 's';

export const HOUR_SECONDS = 60 * 60;
export const DAY_SECONDS = 24 * HOUR_SECONDS;
export const WEEK_SECONDS = 7 * DAY_SECONDS;
export const YEAR_SECONDS = 52 * WEEK_SECONDS;

const UNIT_SECONDS: Record<DurationUnit, number> = {
  y: YEAR_SECONDS,
  w: WEEK_SECONDS,
  d: DAY_SECONDS,
  h: HOUR_SECONDS,
  m: 60,
  s: 1,
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

function sumSeconds(value: string): number {
  return durationParts(value).reduce((total, [n, unit]) => total + n * UNIT_SECONDS[unit], 0);
}

/** Total length in seconds (a year counts as 364 days), or null when the string is malformed. */
export function parseDurationToSeconds(value: string): number | null {
  return isValidDuration(value) ? sumSeconds(value) : null;
}

/**
 * The instant the duration ends when started at `from`, computed as the backend does:
 * a fixed number of seconds, with no calendar or DST adjustment.
 */
export function addDuration(value: string, from: Date = new Date()): Date {
  return new Date(from.getTime() + sumSeconds(value) * 1000);
}

/** "1y2d" → "1 year, 2 days" */
export function formatDuration(value: string): string {
  return durationParts(value)
    .map(([n, unit]) => `${n} ${UNIT_NAMES[unit]}${n === 1 ? '' : 's'}`)
    .join(', ');
}
