/**
 * Turns the configured Wisp URL into one a WebSocket can open.
 *
 * `LAMASSU_TERMINAL_WISP_URL` may be a path such as `/wisp/` (the Wisp server bundled in the
 * Docker image, proxied by nginx on the dashboard's own origin). WebSockets need a ws(s) URL, so a
 * path is resolved against the page: https gives wss, http gives ws. Absolute URLs are kept.
 */
export function resolveWispUrl(value: string | undefined, base: Pick<Location, 'protocol' | 'host'> = window.location): string | undefined {
  const url = value?.trim();
  if (!url) return undefined;
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  return `${base.protocol === 'https:' ? 'wss:' : 'ws:'}//${base.host}${url}`;
}

/**
 * Adds the OIDC access token to a Wisp URL as `access_token`, which is how the dashboard proves who
 * opens the terminal's network: a browser cannot set headers on a WebSocket, so the gateway's external
 * authorization reads it from the query. Only a URL on the dashboard's own origin gets it; a Wisp
 * server somewhere else must never see the user's token. With no token the URL is returned as is.
 */
export function withAccessToken(url: string | undefined, token: string | null | undefined, base: Pick<Location, 'host'> = window.location): string | undefined {
  if (!url || !token) return url;
  try {
    const parsed = new URL(url);
    if (parsed.host !== base.host) return url;
    parsed.searchParams.set('access_token', token);
    return parsed.toString();
  } catch {
    return url;
  }
}
