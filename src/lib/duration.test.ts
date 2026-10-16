import { describe, expect, it } from 'vitest';
import {
  addDuration,
  formatDuration,
  isValidDuration,
  isValidPositiveDuration,
  isZeroDuration,
  parseDurationToSeconds,
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
    expect(parseDurationToSeconds('1y')).toBe(364 * 86_400);
    expect(parseDurationToSeconds('1y2w3d4h5m6s')).toBe(32_933_106);
    expect(parseDurationToSeconds('31d')).toBe(2_678_400);
    expect(parseDurationToSeconds('invalid')).toBeNull();
  });

  it('adds fixed-length units like the backend (1y = 52 weeks)', () => {
    const from = new Date('2024-01-01T00:00:00Z');
    expect(addDuration('1y', from)).toEqual(new Date('2024-12-30T00:00:00Z'));
    expect(addDuration('1d12h', from)).toEqual(new Date('2024-01-02T12:00:00Z'));
  });

  it('formats for humans', () => {
    expect(formatDuration('1y2d')).toBe('1 year, 2 days');
    expect(formatDuration('30m')).toBe('30 minutes');
  });
});
