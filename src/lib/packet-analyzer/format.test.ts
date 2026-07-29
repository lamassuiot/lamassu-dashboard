import { describe, expect, it } from 'vitest';

import {
  buildHexRows,
  decodeBase64,
  formatBytes,
  formatCaptureDuration,
  wiregasmColor,
} from './format';

describe('packet analyzer formatting', () => {
  it('formats capture sizes and durations', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
    expect(formatCaptureDuration(0.125)).toBe('125 ms');
    expect(formatCaptureDuration(65)).toBe('1m 5s');
  });

  it('normalizes Wiregasm RGB values', () => {
    expect(wiregasmColor(0)).toBeUndefined();
    expect(wiregasmColor(0xffaa01)).toBe('#ffaa01');
    expect(wiregasmColor(0x12ffaa01)).toBe('#ffaa01');
  });

  it('decodes base64 packet bytes into 16-byte hex rows', () => {
    const bytes = decodeBase64('AAECAwQFBgcICQoLDA0ODxAREg==');
    const rows = buildHexRows(bytes);

    expect(bytes).toHaveLength(19);
    expect(rows).toHaveLength(2);
    expect(rows[0].offset).toBe(0);
    expect(rows[0].bytes).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(rows[1]).toMatchObject({
      offset: 16,
      bytes: [16, 17, 18],
    });
  });

  it('rejects invalid row widths', () => {
    expect(() => buildHexRows(new Uint8Array([1]), 0)).toThrow(
      'bytesPerRow must be greater than zero.',
    );
  });
});
