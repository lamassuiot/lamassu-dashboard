export interface CBOMOccurrence {
  location?: string;
  line?: number;
  offset?: number;
  additionalContext?: string;
}

export interface CBOMAssetForGrouping {
  'bom-ref'?: string;
  evidence?: {
    occurrences?: CBOMOccurrence[];
  };
}

export interface CBOMDependency {
  ref?: string;
  dependsOn?: string[];
}

export interface GroupedCBOMReference<T extends CBOMAssetForGrouping> {
  bomRef?: string;
  asset: T;
  occurrences: CBOMOccurrence[];
}

export interface GroupedCBOMAsset<T extends CBOMAssetForGrouping> {
  key: string;
  representative: T;
  references: GroupedCBOMReference<T>[];
  bomRefs: string[];
  occurrenceCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hashIdentity = (value: string): string => {
  let first = 0x811c9dc5;
  let second = 0x1505;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second, 33) ^ code;
  }

  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
};

/**
 * Finds every component ref used inside an asset, regardless of the property
 * carrying it. This covers legacy fields such as `algorithmRef`,
 * `subjectPublicKeyRef`, and `signatureAlgorithmRef`, as well as newer shapes
 * such as `relatedCryptographicAssets[].ref`.
 */
const collectKnownAssetRefs = (
  value: unknown,
  knownRefs: ReadonlySet<string>,
  foundRefs: Set<string>,
  depth = 0,
) => {
  if (typeof value === 'string') {
    if (knownRefs.has(value)) {
      foundRefs.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) =>
      collectKnownAssetRefs(entry, knownRefs, foundRefs, depth + 1),
    );
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([key, entry]) => {
    // The component's own ID is a node, not an outbound edge. Evidence is also
    // excluded so a coincidental location/context string cannot become a ref.
    if (depth === 0 && (key === 'bom-ref' || key === 'evidence')) {
      return;
    }
    collectKnownAssetRefs(entry, knownRefs, foundRefs, depth + 1);
  });
};

const getAssetPriority = (
  asset: CBOMAssetForGrouping,
  connectionCount: number,
): number => {
  const rawAsset = asset as Record<string, unknown>;
  const cryptoProperties = isRecord(rawAsset.cryptoProperties)
    ? rawAsset.cryptoProperties
    : null;
  const assetType =
    typeof cryptoProperties?.assetType === 'string'
      ? cryptoProperties.assetType
      : typeof rawAsset.type === 'string'
        ? rawAsset.type
        : '';
  const typePriority: Record<string, number> = {
    certificate: 5,
    protocol: 4,
    'related-crypto-material': 3,
    algorithm: 2,
    'cryptographic-asset': 1,
  };
  const hasName = typeof rawAsset.name === 'string' && rawAsset.name.length > 0;

  return (typePriority[assetType] ?? 0) * 1_000 + connectionCount * 10 + (hasName ? 1 : 0);
};

/**
 * Builds bidirectional, transitive groups from the CBOM reference graph.
 *
 * CycloneDX requires every `bom-ref` to be unique, so equal-ID grouping is a
 * no-op for a valid BOM. Instead, two assets belong to the same group when
 * either one references the other, when a dependency connects them, or when a
 * chain of those relationships connects them. Traversal is deliberately
 * undirected: an inbound `subjectPublicKeyRef`, for example, groups the public
 * key with the certificate even when traversal starts at the public key.
 *
 * `referenceAssets` should contain the complete BOM component set when `assets`
 * is filtered. This preserves connections through assets hidden by a filter.
 */
export const groupCBOMAssets = <T extends CBOMAssetForGrouping>(
  assets: readonly T[],
  dependencies: readonly CBOMDependency[] = [],
  referenceAssets: readonly T[] = assets,
): GroupedCBOMAsset<T>[] => {
  if (assets.length === 0) {
    return [];
  }

  const graphAssets: T[] = [];
  const graphAssetSet = new Set<T>();
  [...referenceAssets, ...assets].forEach((asset) => {
    if (!graphAssetSet.has(asset)) {
      graphAssetSet.add(asset);
      graphAssets.push(asset);
    }
  });

  const parents = graphAssets.map((_, index) => index);
  const connections = graphAssets.map(() => new Set<number>());

  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) {
      root = parents[root];
    }

    while (parents[index] !== index) {
      const parent = parents[index];
      parents[index] = root;
      index = parent;
    }

    return root;
  };

  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot;
    }
  };

  const connect = (left: number, right: number) => {
    if (left === right) {
      return;
    }
    connections[left].add(right);
    connections[right].add(left);
    union(left, right);
  };

  const indexesByRef = new Map<string, number[]>();
  graphAssets.forEach((asset, index) => {
    const bomRef = asset['bom-ref'];
    if (!bomRef) {
      return;
    }
    const indexes = indexesByRef.get(bomRef) ?? [];
    indexes.push(index);
    indexesByRef.set(bomRef, indexes);
  });

  // Repeated refs are invalid in current CycloneDX, but older documents may
  // contain them. Keep the old behavior by connecting every repeated instance.
  indexesByRef.forEach((indexes) => {
    indexes.slice(1).forEach((index) => connect(indexes[0], index));
  });

  const knownRefs = new Set(indexesByRef.keys());
  graphAssets.forEach((asset, sourceIndex) => {
    const referencedRefs = new Set<string>();
    collectKnownAssetRefs(asset, knownRefs, referencedRefs);
    referencedRefs.forEach((targetRef) => {
      indexesByRef
        .get(targetRef)
        ?.forEach((targetIndex) => connect(sourceIndex, targetIndex));
    });
  });

  dependencies.forEach((dependency) => {
    const connectedIndexes = [dependency.ref, ...(dependency.dependsOn ?? [])]
      .filter((bomRef): bomRef is string => Boolean(bomRef))
      .flatMap((bomRef) => indexesByRef.get(bomRef) ?? []);
    connectedIndexes
      .slice(1)
      .forEach((index) => connect(connectedIndexes[0], index));
  });

  const indexByAsset = new Map(
    graphAssets.map((asset, index) => [asset, index] as const),
  );
  const visibleIndexes = assets
    .map((asset) => indexByAsset.get(asset))
    .filter((index): index is number => index !== undefined);
  const visibleIndexesByRoot = new Map<number, number[]>();
  visibleIndexes.forEach((index) => {
    const root = find(index);
    const indexes = visibleIndexesByRoot.get(root) ?? [];
    indexes.push(index);
    visibleIndexesByRoot.set(root, indexes);
  });

  const allIndexesByRoot = new Map<number, number[]>();
  graphAssets.forEach((_, index) => {
    const root = find(index);
    const indexes = allIndexesByRoot.get(root) ?? [];
    indexes.push(index);
    allIndexesByRoot.set(root, indexes);
  });

  return Array.from(visibleIndexesByRoot.keys()).map((root) => {
    const completeGroupIndexes = allIndexesByRoot.get(root) ?? [];
    const orderedIndexes = [...completeGroupIndexes].sort((left, right) => {
      const priorityDifference =
        getAssetPriority(graphAssets[right], connections[right].size) -
        getAssetPriority(graphAssets[left], connections[left].size);
      return priorityDifference || left - right;
    });
    const representative = graphAssets[orderedIndexes[0]];
    const references = orderedIndexes.map((index) => {
      const asset = graphAssets[index];
      return {
        bomRef: asset['bom-ref'],
        asset,
        occurrences: [...(asset.evidence?.occurrences ?? [])],
      };
    });
    const bomRefs = Array.from(
      new Set(
        references
          .map((reference) => reference.bomRef)
          .filter((bomRef): bomRef is string => Boolean(bomRef)),
      ),
    );
    const completeGroupRefs = completeGroupIndexes
      .map((index) => graphAssets[index]['bom-ref'])
      .filter((bomRef): bomRef is string => Boolean(bomRef))
      .sort((left, right) => left.localeCompare(right));
    const groupIdentity = completeGroupRefs.length > 0
      ? completeGroupRefs.join('\u0000')
      : completeGroupIndexes.map(String).join('\u0000');

    return {
      key: `cbom-ref-group-${hashIdentity(groupIdentity)}`,
      representative,
      references,
      bomRefs,
      occurrenceCount: references.reduce(
        (total, reference) => total + reference.occurrences.length,
        0,
      ),
    };
  });
};
