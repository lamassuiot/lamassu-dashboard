'use client';

import { getStoredAccessToken, isAuthEnabled } from './auth-session';

interface ApiFetchOptions extends RequestInit {
  auth?: boolean;
  accessToken?: string | null;
}

const resolveAccessTokenForRequest = (
  auth: boolean,
  accessTokenOverride?: string | null,
): string | null => {
  if (accessTokenOverride !== undefined) {
    return accessTokenOverride || null;
  }

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
  accessTokenOverride?: string | null,
): Headers => {
  const resolvedHeaders = new Headers(headers);
  const accessToken = resolveAccessTokenForRequest(auth, accessTokenOverride);

  if (accessToken) {
    resolvedHeaders.set('Authorization', `Bearer ${accessToken}`);
  } else {
    resolvedHeaders.delete('Authorization');
  }

  return resolvedHeaders;
};

export const apiFetch = async (
  input: RequestInfo | URL,
  { auth = true, accessToken, headers, ...init }: ApiFetchOptions = {},
): Promise<Response> =>
  fetch(input, {
    ...init,
    headers: createApiHeaders(headers, auth, accessToken),
  });
