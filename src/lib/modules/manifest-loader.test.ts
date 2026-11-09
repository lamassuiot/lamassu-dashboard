import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadModulesManifest } from './manifest-loader';

const poc = {
  name: 'poc_service',
  entry: '/ui/modules/poc-service/remoteEntry.js',
  basePath: '/poc-service',
  nav: { group: 'ENTERPRISE', label: 'PoC Service' },
};

const respond = (body: string, init?: ResponseInit) => vi.fn().mockResolvedValue(new Response(body, init));

afterEach(() => vi.restoreAllMocks());

describe('loadModulesManifest', () => {
  it('returns the descriptors of a valid manifest and requests /modules.json without caching', async () => {
    const fetchImpl = respond(JSON.stringify({ version: 1, modules: [poc] }), { status: 200 });
    await expect(loadModulesManifest([], fetchImpl)).resolves.toEqual([poc]);
    expect(fetchImpl).toHaveBeenCalledWith('/modules.json', { cache: 'no-store', signal: expect.any(AbortSignal) });
  });

  it('returns [] without warning when the file does not exist (HTTP 404)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(loadModulesManifest([], respond('nf', { status: 404 }))).resolves.toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns [] and warns once when the SPA fallback answers with index.html (HTTP 200)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = respond('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    await expect(loadModulesManifest([], fetchImpl)).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns [] for invalid JSON', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(loadModulesManifest([], respond('{not json', { status: 200 }))).resolves.toEqual([]);
  });

  it('returns [] when the request fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network down'));
    await expect(loadModulesManifest([], fetchImpl)).resolves.toEqual([]);
  });

  it('gives up after the timeout when the request hangs and returns [] with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hanging = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
    );
    await expect(loadModulesManifest([], hanging as unknown as typeof fetch, 20)).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('drops a module whose basePath collides with a native route and keeps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clash = { ...poc, name: 'clash', basePath: '/devices/x' };
    const fetchImpl = respond(JSON.stringify({ version: 1, modules: [clash, poc] }), { status: 200 });
    await expect(loadModulesManifest(['devices'], fetchImpl)).resolves.toEqual([poc]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
