'use client';

import { useEffect, useState } from 'react';
import { getDeviceGroupStats } from '@/lib/device-groups-api';
import type { DeviceGroupStats } from '@/types/device-group';

// Shared across components so the list rows, hero and devices tab reuse one
// request per group. Entries expire after CACHE_TTL_MS, on failure, or when
// `refreshKey` changes.
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  request: Promise<DeviceGroupStats>;
  refreshKey: number;
  fetchedAt: number;
}

const statsCache = new Map<string, CacheEntry>();

function loadStats(groupId: string, refreshKey: number): Promise<DeviceGroupStats> {
  const cached = statsCache.get(groupId);
  if (cached && cached.refreshKey === refreshKey && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.request;
  }

  const request = getDeviceGroupStats(groupId);
  statsCache.set(groupId, { request, refreshKey, fetchedAt: Date.now() });
  request.catch(() => {
    if (statsCache.get(groupId)?.request === request) statsCache.delete(groupId);
  });
  return request;
}

export function useDeviceGroupStats(groupId: string | null | undefined, refreshKey = 0) {
  const [stats, setStats] = useState<DeviceGroupStats | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(groupId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) {
      setStats(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loadStats(groupId, refreshKey)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch statistics');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, refreshKey]);

  return { stats, isLoading, error };
}
