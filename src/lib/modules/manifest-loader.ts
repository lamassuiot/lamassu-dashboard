import { parseManifest, type ModuleDescriptor } from '@lamassu/mfe-sdk';

const MANIFEST_URL = '/modules.json';
/** Native pages wait for the manifest, so a stalled request must not hold them for long. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Fetches and validates the runtime module manifest. Never throws: a missing file (404), an
 * HTML fallback page, invalid JSON, a network error or a request that takes longer than
 * `timeoutMs` all mean "no external modules".
 *
 * @param reservedFirstSegments first path segments owned by native pages (e.g. `devices`);
 *   modules whose `basePath` starts with one of them are dropped.
 */
export async function loadModulesManifest(
  reservedFirstSegments: string[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ModuleDescriptor[]> {
  let raw: unknown;
  try {
    const response = await fetchImpl(MANIFEST_URL, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return [];
    raw = JSON.parse(await response.text());
  } catch (error) {
    console.warn(`Could not read ${MANIFEST_URL}; continuing without external modules.`, error);
    return [];
  }

  return parseManifest(raw, (message) => console.warn(`${MANIFEST_URL}: ${message}`)).filter((descriptor) => {
    const firstSegment = descriptor.basePath.split('/')[1];
    if (reservedFirstSegments.includes(firstSegment)) {
      console.warn(`${MANIFEST_URL}: module "${descriptor.name}" ignored: "${descriptor.basePath}" collides with a built-in route.`);
      return false;
    }
    return true;
  });
}
