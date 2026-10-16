const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;
const DURATION_PART_REGEX = /(\d+)([ywdhms])/g;

const durationUnitSeconds: Record<string, number> = {
  y: 365 * 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
  d: 24 * 60 * 60,
  h: 60 * 60,
  m: 60,
  s: 1,
};

/** Parses a backend duration string ("1y", "52w3d", "8760h") into seconds. */
export function parseDurationToSeconds(value: string): number | null {
  if (!DURATION_REGEX.test(value)) return null;

  let seconds = 0;
  for (const match of value.matchAll(DURATION_PART_REGEX)) {
    seconds += Number.parseInt(match[1], 10) * durationUnitSeconds[match[2]];
  }

  return seconds;
}
