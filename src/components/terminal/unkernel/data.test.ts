import { afterEach, expect, it, vi } from 'vitest';
import { attachDataDisk } from './data';

const { openDataDisk } = vi.hoisted(() => ({ openDataDisk: vi.fn() }));
vi.mock('./sdk.ts', () => ({ DATA_DISK_NAME: 'test', openDataDisk }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('releases the disk lock when both persistent and snapshot opens fail', async () => {
  const completed = vi.fn();
  const locks = { request: vi.fn((_name, _options, callback) => {
    const result = callback({});
    result.then(completed);
    return result;
  }) };
  vi.stubGlobal('indexedDB', {});
  vi.stubGlobal('navigator', { locks });
  openDataDisk.mockRejectedValueOnce(new Error('persistent failed')).mockRejectedValueOnce(new Error('snapshot failed'));
  await expect(attachDataDisk({ enabled: true, bundled: new Uint8Array([1]), log: () => {}, onError: () => {} })).rejects.toThrow('snapshot failed');
  await Promise.resolve();
  expect(completed).toHaveBeenCalled();
});
