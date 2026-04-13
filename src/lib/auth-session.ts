'use client';

export const isAuthEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }

  return (window as any).lamassuConfig?.LAMASSU_AUTH_ENABLED !== false;
};

export const getStoredAccessToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const config = (window as any).lamassuConfig;
  const authority = config?.LAMASSU_AUTH_AUTHORITY;
  const clientId = config?.LAMASSU_AUTH_CLIENT_ID || 'frontend';

  if (!authority) {
    return null;
  }

  const raw = window.localStorage.getItem(`oidc.user:${authority}:${clientId}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw).access_token ?? null;
  } catch {
    return null;
  }
};

export const requireAccessToken = (): string => {
  const resolvedAccessToken = getStoredAccessToken();

  if (!resolvedAccessToken) {
    throw new Error('User not authenticated.');
  }

  return resolvedAccessToken;
};
