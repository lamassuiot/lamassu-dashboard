'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { matchAndGetGlobalCapabilities } from '@/lib/authz-api';
import { ApiError } from '@/lib/api-domains';
import { isAuthEnabled } from '@/lib/auth-session';

export type PlatformAccessStatus = 'loading' | 'authorized' | 'unauthorized' | 'error';

export interface PlatformAccess {
  status: PlatformAccessStatus;
  /** Map of "schema.entity_type" → allowed global actions. `null` when auth is disabled. */
  globalCapabilities: Record<string, string[]> | null;
  matchedPrincipalIds: string[];
  retry: () => void;
}

/**
 * Gate for the whole platform: resolves the user's global capabilities from their access token.
 * Any non-2xx answer means the user is not authorized to use the platform; a request that never
 * gets an answer (network failure) is reported as `error` so the user can retry.
 *
 * Token renewals for the same user refetch in the background without dropping back to `loading`,
 * so the app is not unmounted every time the session is silently refreshed. A different user (or a
 * sign-out) resets everything to `loading`, so one user's access is never shown to the next.
 *
 * @param userKey Stable identity of the signed-in user (e.g. `iss:sub`).
 */
export function usePlatformAccess(accessToken: string | undefined, userKey: string, enabled: boolean): PlatformAccess {
  const [status, setStatus] = useState<PlatformAccessStatus>('loading');
  const [globalCapabilities, setGlobalCapabilities] = useState<Record<string, string[]> | null>(null);
  const [matchedPrincipalIds, setMatchedPrincipalIds] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);

  // Reset during render (not in an effect) so not even one frame renders with the previous user's access.
  const sessionKey = enabled ? userKey : null;
  const [resolvedSessionKey, setResolvedSessionKey] = useState(sessionKey);
  if (sessionKey !== resolvedSessionKey) {
    setResolvedSessionKey(sessionKey);
    setStatus('loading');
    setGlobalCapabilities(null);
    setMatchedPrincipalIds([]);
  }

  const statusRef = useRef(status);
  statusRef.current = status;

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt(n => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (!isAuthEnabled() || !accessToken) {
      setGlobalCapabilities(null);
      setMatchedPrincipalIds([]);
      setStatus('authorized');
      return;
    }

    let cancelled = false;
    matchAndGetGlobalCapabilities({ auth_type: 'oidc', auth_material: accessToken })
      .then(res => {
        if (cancelled) return;
        setGlobalCapabilities(res.global_actions ?? {});
        setMatchedPrincipalIds(res.matched_principals ?? []);
        setStatus('authorized');
      })
      .catch(err => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setGlobalCapabilities(null);
          setMatchedPrincipalIds([]);
          setStatus('unauthorized');
          return;
        }
        // A transient network failure during a background refresh keeps the current access.
        if (statusRef.current !== 'authorized') {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled, attempt]);

  return { status, globalCapabilities, matchedPrincipalIds, retry };
}
