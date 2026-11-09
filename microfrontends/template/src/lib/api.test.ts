import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeShell } from '../test-fixtures';
import { apiGet } from './api';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

describe('apiGet', () => {
  it('requests apiBaseUrl + path with the bearer token and returns the parsed body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ total: 7 }));
    await expect(apiGet(fakeShell(), '/ca/v1/stats')).resolves.toEqual({ total: 7 });
    expect(fetchSpy).toHaveBeenCalledWith('https://api.test/ca/v1/stats', { headers: { Authorization: 'Bearer tok' } });
  });

  it('sends no Authorization header when there is no token (auth disabled)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}));
    await apiGet(fakeShell({ getAccessToken: () => null }), '/x');
    expect(fetchSpy).toHaveBeenCalledWith('https://api.test/x', { headers: {} });
  });

  it('throws with the status for a non-2xx answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 500));
    await expect(apiGet(fakeShell(), '/x')).rejects.toThrow('HTTP 500');
  });
});
