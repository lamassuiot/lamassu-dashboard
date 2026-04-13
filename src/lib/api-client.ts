'use client';

import { getStoredAccessToken, isAuthEnabled } from './auth-session';

interface ApiFetchOptions extends RequestInit {
  auth?: boolean;
}

const resolveAccessTokenForRequest = (auth: boolean): string | null => {
  if (!auth) {
    return null;
  }

  if (!isAuthEnabled()) {
    return null;
  }

  const accessToken = getStoredAccessToken();

  if (!accessToken) {
    throw new Error('User not authenticated.');
  }

  return accessToken;
};

export const createApiHeaders = (
  headers?: HeadersInit,
  auth = true,
): Headers => {
  const resolvedHeaders = new Headers(headers);

  if (!auth) {
    return resolvedHeaders;
  }

  const accessToken = resolveAccessTokenForRequest(auth);

  if (accessToken) {
    resolvedHeaders.set('Authorization', `Bearer ${accessToken}`);
  } else {
    resolvedHeaders.delete('Authorization');
  }

  return resolvedHeaders;
};

export const apiFetch = async (
  input: RequestInfo | URL,
  { auth = true, headers, ...init }: ApiFetchOptions = {},
): Promise<Response> =>
  fetch(input, {
    ...init,
    headers: createApiHeaders(headers, auth),
  });
