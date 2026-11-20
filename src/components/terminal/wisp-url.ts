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
