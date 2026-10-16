import { describe, expect, it } from 'vitest';
import {
  addDuration,
  formatDuration,
  isValidDuration,
  isValidPositiveDuration,
  isZeroDuration,
  parseDurationToSeconds,
  toDateFnsDuration,
} from './duration';

describe('duration', () => {
  it('validates unit order and repetition', () => {
    expect(isValidDuration('1y2w3d4h5m6s')).toBe(true);
    expect(isValidDuration('0d')).toBe(true);
    expect(isValidDuration('3d1y')).toBe(false);
    expect(isValidDuration('1d1d')).toBe(false);
    expect(isValidDuration('10')).toBe(false);
    expect(isValidDuration('')).toBe(false);
  });

  it('rejects zero durations as non-positive', () => {
    expect(isZeroDuration('0y0s')).toBe(true);
    expect(isValidPositiveDuration('0d')).toBe(false);
    expect(isValidPositiveDuration('1h')).toBe(true);
  });

  it('parses compound duration values to seconds', () => {
    expect(parseDurationToSeconds('1y2w3d4h5m6s')).toBe(33_019_506);
    expect(parseDurationToSeconds('31d')).toBe(2_678_400);
    expect(parseDurationToSeconds('invalid')).toBeNull();
  });

  it('maps to date-fns fields and adds calendar-aware', () => {
    expect(toDateFnsDuration('1y2w')).toEqual({ years: 1, weeks: 2 });
    const from = new Date(2024, 1, 29);
    expect(addDuration('1y', from)).toEqual(new Date(2025, 1, 28));
  });

  it('formats for humans', () => {
    expect(formatDuration('1y2d')).toBe('1 year, 2 days');
    expect(formatDuration('30m')).toBe('30 minutes');
  });
});
