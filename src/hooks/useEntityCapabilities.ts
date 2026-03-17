'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getEntityCapabilities, matchAndGetEntityCapabilities } from '@/lib/authz-api';
import type { EntityCapabilityQuery } from '@/types/authz';

/**
 * Reads the OIDC access token from localStorage using the same key that
 * oidc-client-ts writes: `oidc.user:<authority>:<client_id>`.
 * Returns null when auth is disabled or the session has expired.
 */
const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  const config = (window as any).lamassuConfig;
  const authority = config?.LAMASSU_AUTH_AUTHORITY;
  const clientId = config?.LAMASSU_AUTH_CLIENT_ID || 'frontend';
  if (!authority) return null;
  const raw = localStorage.getItem(`oidc.user:${authority}:${clientId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw).access_token ?? null;
  } catch {
    return null;
  }
};

const getSelectedPrincipal = (): string =>
  typeof window !== 'undefined' ? (localStorage.getItem('selectedPrincipal') || 'admin') : 'admin';

export interface UseEntityCapabilitiesResult {
  isLoading: boolean;
  error: string | null;
  /**
   * Returns true if the current principal can perform `action` on the entity with `entityId`.
   * Returns false during loading or when the entity has no matching allowed action.
   */
  canPerform: (entityId: string, action: string) => boolean;
}

/**
 * Batch-fetches entity-level capabilities for the current principal.
 *
 * @param queries  One or more entity queries. Use `useMemo` on the array to avoid
 *                 unnecessary re-fetches — the hook only re-runs when the serialised
 *                 query set changes.
 * @param skip     When true the hook does nothing and `canPerform` always returns false.
 *
 * @example
 * const { canPerform } = useEntityCapabilities([
 *   { namespace: 'pki', schema_name: 'lamassu', entity_type: 'Certificate', entity_id: cert.serialNumber },
 * ]);
 *
 * <EntityActionGuard allowed={canPerform(cert.serialNumber, 'revoke')}>
 *   <Button>Revoke</Button>
 * </EntityActionGuard>
 */
export function useEntityCapabilities(
  queries: EntityCapabilityQuery[],
  skip = false,
): UseEntityCapabilitiesResult {
  // Map entity_id → allowed actions
  const [actionsMap, setActionsMap] = useState<Map<string, string[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable serialisation key — only re-fetch when the actual queries change
  const queriesKey = queries
    .map((q) => `${q.namespace}|${q.schema_name}|${q.entity_type}|${q.entity_id}`)
    .sort()
    .join(';;');

  // Track the last fetched key so we don't repeat the same request
  const lastFetchedKey = useRef<string | null>(null);

  useEffect(() => {
    if (skip || queries.length === 0) {
      setIsLoading(false);
      setActionsMap(new Map());
      return;
    }

    if (lastFetchedKey.current === queriesKey) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const token = getAccessToken();
    const request = token
      ? matchAndGetEntityCapabilities({ auth_type: 'oidc', auth_material: `Bearer ${token}`, queries })
      : getEntityCapabilities({
          principal_id: getSelectedPrincipal() === 'admin' ? 'admin-mode' : getSelectedPrincipal(),
          queries,
        });

    request
      .then((resp) => {
        if (cancelled) return;
        const map = new Map<string, string[]>();
        for (const result of resp.results) {
          map.set(result.entity_id, result.actions);
        }
        setActionsMap(map);
        lastFetchedKey.current = queriesKey;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to check capabilities');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // queriesKey is the stable dep — queries/skip are captured via it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queriesKey, skip]);

  const canPerform = useCallback(
    (entityId: string, action: string): boolean => {
      const actions = actionsMap.get(entityId);
      if (!actions) return false;
      return actions.includes('*') || actions.includes(action);
    },
    [actionsMap],
  );

  return { isLoading, error, canPerform };
}
