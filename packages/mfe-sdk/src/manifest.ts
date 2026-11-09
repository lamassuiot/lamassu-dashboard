import { z } from 'zod';

export interface ModuleNav {
  group: string;
  label: string;
  icon?: string;
  uiAuthzCapabilities?: string;
}

export interface ModuleDescriptor {
  /** Module Federation remote name; must be a valid JS identifier and unique. */
  name: string;
  /** URL of the remote's `remoteEntry.js` (absolute, or relative to the page origin). */
  entry: string;
  /** Route prefix; the module is mounted at `${basePath}/*`. */
  basePath: string;
  nav: ModuleNav;
}

/** `entry` is executed as code in the dashboard origin: accept only http(s) URLs or paths that actually parse. */
function isLoadableEntry(entry: string): boolean {
  try {
    const { protocol } = new URL(entry, 'http://base.invalid');
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const descriptorSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'name must be a valid identifier'),
  entry: z.string().min(1, 'entry must not be empty').refine(isLoadableEntry, 'entry must be an http(s) URL or a path'),
  basePath: z
    .string()
    .transform((p) => p.replace(/\/+$/, ''))
    .refine((p) => p.startsWith('/') && p.length > 1, 'basePath must start with "/" and not be "/"'),
  nav: z.object({
    group: z.string().min(1, 'nav.group must not be empty'),
    label: z.string().min(1, 'nav.label must not be empty'),
    icon: z.string().optional(),
    uiAuthzCapabilities: z.string().optional(),
  }),
});

/**
 * Validates a parsed `modules.json`. Invalid or duplicate (by `name` or `basePath`) entries are
 * dropped and reported through `onInvalid`; they never affect the valid ones.
 */
export function parseManifest(raw: unknown, onInvalid?: (message: string) => void): ModuleDescriptor[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const { version, modules } = raw as { version?: unknown; modules?: unknown };
  if (version !== 1 || !Array.isArray(modules)) return [];

  const result: ModuleDescriptor[] = [];
  const names = new Set<string>();
  const basePaths = new Set<string>();

  modules.forEach((item, index) => {
    const parsed = descriptorSchema.safeParse(item);
    if (!parsed.success) {
      onInvalid?.(`modules[${index}] ignored: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      return;
    }
    const descriptor = parsed.data as ModuleDescriptor;
    if (names.has(descriptor.name) || basePaths.has(descriptor.basePath)) {
      onInvalid?.(`modules[${index}] ignored: duplicate name "${descriptor.name}" or basePath "${descriptor.basePath}"`);
      return;
    }
    names.add(descriptor.name);
    basePaths.add(descriptor.basePath);
    result.push(descriptor);
  });

  return result;
}
