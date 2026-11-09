import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ModulesProvider, useModules } from './ModulesContext';
import { loadModulesManifest } from '@/lib/modules/manifest-loader';
import { registerModuleRemotes } from '@/lib/modules/federation';

vi.mock('@/lib/modules/manifest-loader', () => ({ loadModulesManifest: vi.fn() }));
vi.mock('@/lib/modules/federation', () => ({ registerModuleRemotes: vi.fn() }));

const poc = {
  name: 'poc_service',
  entry: '/ui/modules/poc-service/remoteEntry.js',
  basePath: '/poc-service',
  nav: { group: 'ENTERPRISE', label: 'PoC Service' },
};
const reserved = ['devices'];
const wrapper = ({ children }: { children: ReactNode }) => (
  <ModulesProvider reservedFirstSegments={reserved}>{children}</ModulesProvider>
);

beforeEach(() => vi.clearAllMocks());

describe('ModulesProvider', () => {
  it('is loading first, then ready with the modules after registering them', async () => {
    vi.mocked(loadModulesManifest).mockResolvedValue([poc]);
    const { result } = renderHook(() => useModules(), { wrapper });
    expect(result.current).toEqual({ status: 'loading', modules: [] });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.modules).toEqual([poc]);
    expect(loadModulesManifest).toHaveBeenCalledWith(reserved);
    expect(registerModuleRemotes).toHaveBeenCalledWith([poc]);
  });

  it('becomes ready with no modules if loading rejects', async () => {
    vi.mocked(loadModulesManifest).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useModules(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.modules).toEqual([]);
  });

  it('becomes ready with no modules if registering them throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(loadModulesManifest).mockResolvedValue([poc]);
    vi.mocked(registerModuleRemotes).mockImplementationOnce(() => {
      throw new TypeError('Invalid URL');
    });
    const { result } = renderHook(() => useModules(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.modules).toEqual([]);
  });

  it('throws outside a provider', () => {
    expect(() => renderHook(() => useModules())).toThrow('useModules must be used within a ModulesProvider');
  });
});
