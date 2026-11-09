import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRemote, registerRemotes } from '@module-federation/runtime';
import { loadModuleDefinition, registerModuleRemotes } from './federation';

vi.mock('@module-federation/runtime', () => ({ registerRemotes: vi.fn(), loadRemote: vi.fn() }));

const descriptor = (entry: string) => ({
  name: 'poc_service',
  entry,
  basePath: '/poc-service',
  nav: { group: 'ENTERPRISE', label: 'PoC Service' },
});

beforeEach(() => vi.clearAllMocks());

describe('registerModuleRemotes', () => {
  it('registers each module resolving relative entries against the page origin', () => {
    registerModuleRemotes([descriptor('/ui/modules/poc-service/remoteEntry.js')]);
    expect(registerRemotes).toHaveBeenCalledWith([
      { name: 'poc_service', entry: `${window.location.origin}/ui/modules/poc-service/remoteEntry.js`, type: 'module' },
    ]);
  });

  it('leaves absolute entries untouched', () => {
    registerModuleRemotes([descriptor('http://localhost:9010/remoteEntry.js')]);
    expect(registerRemotes).toHaveBeenCalledWith([
      { name: 'poc_service', entry: 'http://localhost:9010/remoteEntry.js', type: 'module' },
    ]);
  });

  it('does nothing for an empty list', () => {
    registerModuleRemotes([]);
    expect(registerRemotes).not.toHaveBeenCalled();
  });
});

describe('loadModuleDefinition', () => {
  it('loads "<name>/module" and returns its default export', async () => {
    const definition = { contractVersion: 1, Root: () => null };
    vi.mocked(loadRemote).mockResolvedValue({ default: definition });
    await expect(loadModuleDefinition('poc_service')).resolves.toBe(definition);
    expect(loadRemote).toHaveBeenCalledWith('poc_service/module');
  });

  it('rejects with the module name when the remote resolves to null', async () => {
    vi.mocked(loadRemote).mockResolvedValue(null);
    await expect(loadModuleDefinition('poc_service')).rejects.toThrow(/poc_service/);
  });

  it('rejects with the module name when the remote has no default export', async () => {
    vi.mocked(loadRemote).mockResolvedValue({});
    await expect(loadModuleDefinition('poc_service')).rejects.toThrow(/poc_service/);
  });
});
