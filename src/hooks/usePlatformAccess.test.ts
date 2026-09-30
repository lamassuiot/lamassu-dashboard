import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePlatformAccess } from './usePlatformAccess';
import { matchAndGetGlobalCapabilities } from '@/lib/authz-api';

vi.mock('@/lib/authz-api', () => ({ matchAndGetGlobalCapabilities: vi.fn() }));
vi.mock('@/lib/auth-session', () => ({ isAuthEnabled: () => true }));

const matchMock = vi.mocked(matchAndGetGlobalCapabilities);

type Props = { token?: string; userKey: string; enabled: boolean };
const render = (initialProps: Props) =>
  renderHook(({ token, userKey, enabled }: Props) => usePlatformAccess(token, userKey, enabled), { initialProps });

const capabilitiesFor = (user: string) => ({ global_actions: { 'pki.ca': [`read-${user}`] }, matched_principals: [user] });

/** A request that stays pending until the test resolves or rejects it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('usePlatformAccess', () => {
  beforeEach(() => matchMock.mockReset());

  it('does not carry one user\'s access over to the next user', async () => {
    matchMock.mockResolvedValueOnce(capabilitiesFor('alice') as never);
    const { result, rerender } = render({ token: 'alice-token', userKey: 'idp:alice', enabled: true });
    await waitFor(() => expect(result.current.status).toBe('authorized'));

    // Alice signs out, Bob signs in; Bob's request is still in flight.
    const bobRequest = deferred<ReturnType<typeof capabilitiesFor>>();
    matchMock.mockReturnValueOnce(bobRequest.promise as never);
    rerender({ token: undefined, userKey: 'anonymous', enabled: false });
    rerender({ token: 'bob-token', userKey: 'idp:bob', enabled: true });

    expect(result.current.status).toBe('loading');
    expect(result.current.globalCapabilities).toBeNull();
    expect(result.current.matchedPrincipalIds).toEqual([]);

    bobRequest.resolve(capabilitiesFor('bob'));
    await waitFor(() => expect(result.current.matchedPrincipalIds).toEqual(['bob']));
    expect(result.current.status).toBe('authorized');
  });

  it('reports a network failure for a new user as an error instead of keeping the previous access', async () => {
    matchMock.mockResolvedValueOnce(capabilitiesFor('alice') as never);
    const { result, rerender } = render({ token: 'alice-token', userKey: 'idp:alice', enabled: true });
    await waitFor(() => expect(result.current.status).toBe('authorized'));

    matchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    rerender({ token: 'bob-token', userKey: 'idp:bob', enabled: true });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.globalCapabilities).toBeNull();
  });

  it('keeps access while the same user\'s token is renewed in the background', async () => {
    matchMock.mockResolvedValueOnce(capabilitiesFor('alice') as never);
    const { result, rerender } = render({ token: 'alice-token-1', userKey: 'idp:alice', enabled: true });
    await waitFor(() => expect(result.current.status).toBe('authorized'));

    const renewal = deferred<ReturnType<typeof capabilitiesFor>>();
    matchMock.mockReturnValueOnce(renewal.promise as never);
    rerender({ token: 'alice-token-2', userKey: 'idp:alice', enabled: true });

    expect(result.current.status).toBe('authorized');
    expect(result.current.matchedPrincipalIds).toEqual(['alice']);

    renewal.reject(new TypeError('Failed to fetch'));
    await waitFor(() => expect(matchMock).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('authorized');
  });
});
