/**
 * The sw-description is the recipe an SWU build reads: which files to install and where. It names
 * its files, and the build only includes what it names — so a descriptor and the artifacts it is
 * built with have to agree, and nothing checked that they did.
 *
 * What went wrong without it: swupdate reads the descriptor inside the .swu, looks for a file the
 * archive does not contain, and the install fails ON THE DEVICE. The build itself succeeds, the pack
 * reports built, the campaign launches, and every target fails — the failure is as far from its
 * cause as it can get. The mirror case is quieter and just as wrong: an artifact uploaded but not
 * declared is silently left out of the image, so a device installs an update missing a component.
 *
 * Both are decidable before the build runs, from the descriptor text and the list of files, which is
 * what this module does.
 */

/**
 * The filenames a descriptor declares.
 *
 * Two formats are handled because both are in use: swupdate's own libconfig-style
 * `filename = "..."` and a JSON descriptor. The JSON shape varies by generator, so the three nesting
 * layouts seen in practice are each tried before falling back to the text scan — a JSON descriptor
 * whose layout is unrecognised still yields its filenames that way, since the same
 * `"filename": "..."` text appears in it.
 */
export function extractDescriptorFiles(content: string): string[] {
  if (!content.trim()) return [];
  try {
    const d = JSON.parse(content);
    const fromArray = (arr: unknown): string[] =>
      Array.isArray(arr)
        ? arr
            .map((f) => (typeof f === 'string' ? f : (f as { filename?: string } | null)?.filename))
            .filter((f): f is string => Boolean(f))
        : [];
    for (const candidate of [d?.files, d?.software?.ecs?.files, d?.software?.files]) {
      const names = fromArray(candidate);
      if (names.length > 0) return names;
    }
    // Recognised as JSON but not in a known layout: fall through to the text scan rather than
    // reporting "declares nothing", which would make the consistency check vacuously pass.
  } catch {
    // Not JSON — the libconfig form below is the common case.
  }
  const FILENAME = /["']?filename["']?\s*[=:]\s*["']([^"']+)["']/;
  const matches = content.match(new RegExp(FILENAME.source, 'g')) ?? [];
  return matches.map((m) => m.match(FILENAME)?.[1] ?? '').filter(Boolean);
}

export interface DescriptorFileState {
  /** The name as the descriptor declares it. */
  name: string;
  /** Where it will come from, or that it is nowhere. */
  status: 'stored' | 'staged' | 'missing';
}

export interface DescriptorCheck {
  /** Every declared file with where it comes from, in declaration order. */
  declared: DescriptorFileState[];
  /** Declared but neither already on the module nor being uploaded — the build would produce an
   *  image whose recipe points at a file that is not in it. */
  missing: string[];
  /** Present or staged but not declared: the build will not include these, so uploading them
   *  achieves nothing. A warning, not an error — a descriptor may legitimately be a subset while an
   *  operator stages the next file. */
  undeclared: string[];
}

/**
 * Cross-check a descriptor against the files that will actually be available to the build.
 *
 * `stored` are the filenames already attached, `staged` the ones being uploaded now — the
 * distinction is only for reporting; a file counts as available either way, which is the whole point
 * ("present OR uploaded").
 *
 * Comparison is on the BASENAME and case-insensitive: a descriptor commonly writes a bare filename
 * for an artifact stored with a path, and matching those literally reported files as missing that
 * were right there.
 */
export function checkDescriptorFiles({
  content,
  stored = [],
  staged = [],
}: {
  content: string;
  stored?: string[];
  staged?: string[];
}): DescriptorCheck {
  const base = (n: string) => (n.split('/').pop() ?? n).trim().toLowerCase();
  const storedSet = new Set(stored.map(base));
  const stagedSet = new Set(staged.map(base));

  const names = extractDescriptorFiles(content);
  const declared: DescriptorFileState[] = names.map((name) => ({
    name,
    status: stagedSet.has(base(name)) ? 'staged' : storedSet.has(base(name)) ? 'stored' : 'missing',
  }));

  const declaredSet = new Set(names.map(base));
  return {
    declared,
    missing: declared.filter((d) => d.status === 'missing').map((d) => d.name),
    // Only meaningful once the descriptor declares something: with no descriptor every file would
    // read as undeclared, which is not a finding.
    undeclared:
      names.length === 0 ? [] : [...stored, ...staged].filter((n) => !declaredSet.has(base(n))),
  };
}
