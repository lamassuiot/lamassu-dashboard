'use client';

import React from 'react';

interface EntityActionGuardProps {
  /**
   * Whether the current principal is allowed to perform the action.
   *
   * - `true`      → renders children normally
   * - `false`     → renders `fallback` (default: nothing)
   * - `undefined` → treated as "not yet known"; renders `fallback`
   *                 (prevents button flash when capabilities are still loading)
   */
  allowed: boolean | undefined;
  children: React.ReactNode;
  /**
   * What to render when the action is not allowed or capabilities are loading.
   * Defaults to `null` (renders nothing).
   */
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders `children` based on whether the action is permitted.
 *
 * Pair with `useEntityCapabilities` to check entity-level authz in batch:
 *
 * ```tsx
 * const { canPerform } = useEntityCapabilities([
 *   { namespace: 'pki', schema_name: 'lamassu', entity_type: 'Certificate', entity_id: cert.serialNumber },
 * ]);
 *
 * <EntityActionGuard allowed={canPerform(cert.serialNumber, 'revoke')}>
 *   <Button>Revoke Certificate</Button>
 * </EntityActionGuard>
 * ```
 */
export function EntityActionGuard({
  allowed,
  children,
  fallback = null,
}: EntityActionGuardProps) {
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
