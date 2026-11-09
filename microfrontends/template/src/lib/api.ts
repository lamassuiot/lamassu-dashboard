import type { ShellApi } from '@lamassu/mfe-sdk';

/** GET `${apiBaseUrl}${path}` with the shell's current access token; throws on a non-2xx answer. */
export async function apiGet<T>(shell: ShellApi, path: string): Promise<T> {
  const token = shell.getAccessToken();
  const response = await fetch(`${shell.apiBaseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}
