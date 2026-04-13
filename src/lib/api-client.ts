'use client';

import { getStoredAccessToken, isAuthEnabled } from './auth-session';

export type ApiFetchAuthMode = 'required' | 'optional' | 'none';

interface ApiFetchOptions extends RequestInit {
  auth?: ApiFetchAuthMode;
  accessToken?: string | null;
}

const resolveAccessTokenForRequest = (
  auth: ApiFetchAuthMode,
  accessTokenOverride?: string | null,
): string | null => {
  if (auth === 'none') {
    return null;
  }

  if (accessTokenOverride !== undefined) {
    return accessTokenOverride || null;
  }

  if (!isAuthEnabled()) {
    return null;
  }

  const accessToken = getStoredAccessToken();

  if (!accessToken && auth === 'required') {
    throw new Error('User not authenticated.');
  }

  return accessToken;
};

export const createApiHeaders = (
  headers?: HeadersInit,
  auth: ApiFetchAuthMode = 'required',
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
  { auth = 'required', accessToken, headers, ...init }: ApiFetchOptions = {},
): Promise<Response> =>
  fetch(input, {
    ...init,
    headers: createApiHeaders(headers, auth, accessToken),
  });
