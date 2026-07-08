'use client';

export const AUTH_DISABLED_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXZAbGFtYXNzdS5pbyIsImFkbWluIjp0cnVlLCJpYXQiOjE1MTYyMzkwMjJ9.EgdjNI3kDaDzVqNcPJcXyQ2xQgADTKnzlmdKc7MohYk';

export const isAuthEnabledValue = (value: unknown): boolean =>
  value !== false && !(typeof value === 'string' && value.toLowerCase() === 'false');

export const isAuthEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }

  return isAuthEnabledValue((window as any).lamassuConfig?.LAMASSU_AUTH_ENABLED);
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

export const getAccessTokenForApiRequest = (accessToken?: string | null): string | null => {
  if (!isAuthEnabled()) {
    return AUTH_DISABLED_ACCESS_TOKEN;
  }

  return accessToken || getStoredAccessToken();
};
