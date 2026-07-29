export interface CertificateHierarchyOccurrence {
  location?: string;
  line?: number;
  offset?: number;
  additionalContext?: string;
}

export interface CertificateHierarchyAsset {
  'bom-ref'?: string;
  name?: string;
  type?: string;
  evidence?: {
    occurrences?: CertificateHierarchyOccurrence[];
  };
  cryptoProperties?: {
    assetType?: string;
    certificateProperties?: {
      issuerName?: string;
      subjectName?: string;
      subjectPublicKeyRef?: string;
      signatureAlgorithmRef?: string;
    };
    relatedCryptoMaterialProperties?: {
      value?: string;
    };
  };
  properties?: Array<{ name?: string; value?: string }>;
}

export type CertificateHierarchyStatus =
  | 'root'
  | 'linked'
  | 'verified'
  | 'ambiguous'
  | 'gap'
  | 'unnamed'
  | 'cycle';

export interface CertificateHierarchyNode<T extends CertificateHierarchyAsset> {
  id: string;
  representative: T;
  assets: T[];
  bomRefs: string[];
  occurrences: CertificateHierarchyOccurrence[];
  subjectName: string;
  issuerName: string;
  subjectPublicKeyRef: string;
  signatureAlgorithmRef: string;
  issuerCertificateRef: string;
  parentIds: string[];
  childIds: string[];
  isSelfIssued: boolean;
  isRefLinked: boolean;
}

export interface CertificateHierarchyRow<T extends CertificateHierarchyAsset> {
  key: string;
  node: CertificateHierarchyNode<T>;
  depth: number;
  status: CertificateHierarchyStatus;
  parentRowKey?: string;
  ancestorRowKeys: string[];
}

export interface CertificateHierarchyResult<T extends CertificateHierarchyAsset> {
  nodes: CertificateHierarchyNode<T>[];
  rows: CertificateHierarchyRow<T>[];
  certificateCount: number;
  deduplicatedCount: number;
  selfIssuedRootCount: number;
  ambiguousCount: number;
  gapCount: number;
  unnamedCount: number;
}

const normalizeName = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

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

const getNodeLabel = <T extends CertificateHierarchyAsset>(
  node: CertificateHierarchyNode<T>,
): string => node.subjectName || node.representative.name || node.bomRefs[0] || 'Unnamed certificate';

const getNodeStatus = <T extends CertificateHierarchyAsset>(
  node: CertificateHierarchyNode<T>,
): CertificateHierarchyStatus => {
  if (!node.subjectName) return 'unnamed';
  if (node.isSelfIssued) return 'root';
  if (node.parentIds.length === 0) return 'gap';
  if (node.isRefLinked) return 'verified';
  if (node.parentIds.length > 1) return 'ambiguous';
  return 'linked';
};

const getIssuerCertificateRef = <T extends CertificateHierarchyAsset>(
  certificate: T,
): string =>
  normalizeName(
    certificate.properties?.find((property) => property.name === 'live-cbom:issuerCertificateRef')
      ?.value,
  );

/**
 * Builds the certificate hierarchy. When a certificate carries a
 * `live-cbom:issuerCertificateRef` property that resolves to another
 * certificate in the set, that ref is authoritative and used as the sole
 * parent (status `verified`). Otherwise it falls back to nominal
 * issuer-name/subject-name matching (status `linked`/`ambiguous`), since that
 * is inferred rather than observed. It deliberately does not accept or
 * inspect CycloneDX dependencies because those edges describe cryptographic
 * composition, not issuer hierarchy.
 */
export const buildCertificateHierarchy = <T extends CertificateHierarchyAsset>(
  assets: readonly T[],
): CertificateHierarchyResult<T> => {
  const assetsByRef = new Map<string, T>();
  assets.forEach((asset) => {
    const bomRef = asset['bom-ref'];
    if (bomRef && !assetsByRef.has(bomRef)) {
      assetsByRef.set(bomRef, asset);
    }
  });

  const certificates = assets.filter(
    (asset) => asset.cryptoProperties?.assetType === 'certificate',
  );
  const nodeByIdentity = new Map<string, CertificateHierarchyNode<T>>();

  certificates.forEach((certificate, certificateIndex) => {
    const properties = certificate.cryptoProperties?.certificateProperties;
    const subjectName = normalizeName(properties?.subjectName);
    const issuerName = normalizeName(properties?.issuerName);
    const subjectPublicKeyRef = normalizeName(properties?.subjectPublicKeyRef);
    const signatureAlgorithmRef = normalizeName(properties?.signatureAlgorithmRef);
    const publicKeyValue = normalizeName(
      assetsByRef.get(subjectPublicKeyRef)?.cryptoProperties?.relatedCryptoMaterialProperties?.value,
    );
    const fallbackIdentity =
      certificate['bom-ref'] || subjectPublicKeyRef || `certificate-${certificateIndex}`;
    const identity = [
      subjectName,
      issuerName,
      publicKeyValue || `unresolved:${fallbackIdentity}`,
    ].join('\u0000');
    const existing = nodeByIdentity.get(identity);

    const issuerCertificateRef = getIssuerCertificateRef(certificate);

    if (existing) {
      existing.assets.push(certificate);
      if (certificate['bom-ref'] && !existing.bomRefs.includes(certificate['bom-ref'])) {
        existing.bomRefs.push(certificate['bom-ref']);
      }
      existing.occurrences.push(...(certificate.evidence?.occurrences ?? []));
      if (!existing.issuerCertificateRef && issuerCertificateRef) {
        existing.issuerCertificateRef = issuerCertificateRef;
      }
      return;
    }

    nodeByIdentity.set(identity, {
      id: `certificate-${hashIdentity(identity)}`,
      representative: certificate,
      assets: [certificate],
      bomRefs: certificate['bom-ref'] ? [certificate['bom-ref']] : [],
      occurrences: [...(certificate.evidence?.occurrences ?? [])],
      subjectName,
      issuerName,
      subjectPublicKeyRef,
      signatureAlgorithmRef,
      issuerCertificateRef,
      parentIds: [],
      childIds: [],
      isSelfIssued: Boolean(subjectName && issuerName && subjectName === issuerName),
      isRefLinked: false,
    });
  });

  const nodes = Array.from(nodeByIdentity.values());
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodesBySubject = new Map<string, CertificateHierarchyNode<T>[]>();
  const nodeIdByBomRef = new Map<string, string>();

  nodes.forEach((node) => {
    if (!node.subjectName) return;
    const matchingNodes = nodesBySubject.get(node.subjectName) ?? [];
    matchingNodes.push(node);
    nodesBySubject.set(node.subjectName, matchingNodes);
  });

  nodes.forEach((node) => {
    node.bomRefs.forEach((bomRef) => {
      if (!nodeIdByBomRef.has(bomRef)) {
        nodeIdByBomRef.set(bomRef, node.id);
      }
    });
  });

  nodes.forEach((node) => {
    if (node.isSelfIssued || !node.subjectName) {
      return;
    }

    const refTargetNodeId = node.issuerCertificateRef
      ? nodeIdByBomRef.get(node.issuerCertificateRef)
      : undefined;

    if (refTargetNodeId && refTargetNodeId !== node.id) {
      node.parentIds = [refTargetNodeId];
      node.isRefLinked = true;
    } else if (node.issuerName) {
      node.parentIds = (nodesBySubject.get(node.issuerName) ?? []).map(
        (candidate) => candidate.id,
      );
    }

    node.parentIds.forEach((parentId) => {
      const parent = nodeById.get(parentId);
      if (parent && !parent.childIds.includes(node.id)) {
        parent.childIds.push(node.id);
      }
    });
  });

  const sortNodeIds = (nodeIds: readonly string[]): string[] =>
    [...nodeIds].sort((leftId, rightId) => {
      const left = nodeById.get(leftId);
      const right = nodeById.get(rightId);
      if (!left || !right) return leftId.localeCompare(rightId);
      return (
        getNodeLabel(left).localeCompare(getNodeLabel(right))
        || left.issuerName.localeCompare(right.issuerName)
        || left.id.localeCompare(right.id)
      );
    });

  const rows: CertificateHierarchyRow<T>[] = [];
  const reachedNodeIds = new Set<string>();

  const appendRows = (
    nodeId: string,
    depth: number,
    pathNodeIds: string[],
    ancestorRowKeys: string[],
    parentRowKey?: string,
    forcedStatus?: CertificateHierarchyStatus,
  ) => {
    const node = nodeById.get(nodeId);
    if (!node) return;

    if (pathNodeIds.includes(nodeId)) {
      const cycleKey = `hierarchy-${hashIdentity([...pathNodeIds, nodeId].join('>'))}`;
      rows.push({
        key: cycleKey,
        node,
        depth,
        status: 'cycle',
        parentRowKey,
        ancestorRowKeys,
      });
      return;
    }

    const nextPathNodeIds = [...pathNodeIds, nodeId];
    const rowKey = `hierarchy-${hashIdentity(nextPathNodeIds.join('>'))}`;
    rows.push({
      key: rowKey,
      node,
      depth,
      status: forcedStatus ?? getNodeStatus(node),
      parentRowKey,
      ancestorRowKeys,
    });
    reachedNodeIds.add(nodeId);

    sortNodeIds(node.childIds).forEach((childId) => {
      appendRows(
        childId,
        depth + 1,
        nextPathNodeIds,
        [...ancestorRowKeys, rowKey],
        rowKey,
      );
    });
  };

  const rootIds = sortNodeIds(
    nodes
      .filter(
        (node) =>
          node.isSelfIssued
          || !node.subjectName
          || (!node.isSelfIssued && node.parentIds.length === 0),
      )
      .map((node) => node.id),
  );
  rootIds.forEach((rootId) => appendRows(rootId, 0, [], []));

  // A component with no root is cyclic. Surface it rather than silently
  // dropping it, while path-local cycle detection prevents infinite traversal.
  sortNodeIds(
    nodes.filter((node) => !reachedNodeIds.has(node.id)).map((node) => node.id),
  ).forEach((nodeId) => {
    if (!reachedNodeIds.has(nodeId)) {
      appendRows(nodeId, 0, [], [], undefined, 'cycle');
    }
  });

  return {
    nodes,
    rows,
    certificateCount: certificates.length,
    deduplicatedCount: certificates.length - nodes.length,
    selfIssuedRootCount: nodes.filter((node) => node.isSelfIssued).length,
    ambiguousCount: nodes.filter((node) => node.parentIds.length > 1).length,
    gapCount: nodes.filter(
      (node) =>
        Boolean(node.subjectName)
        && !node.isSelfIssued
        && node.parentIds.length === 0,
    ).length,
    unnamedCount: nodes.filter((node) => !node.subjectName).length,
  };
};

export const getCertificateHierarchyStatusLabel = (
  status: CertificateHierarchyStatus,
  issuerCandidateCount: number,
): string => {
  switch (status) {
    case 'root':
      return 'Self-issued';
    case 'verified':
      return 'Verified issuer';
    case 'ambiguous':
      return `${issuerCandidateCount} issuer candidates`;
    case 'gap':
      return 'Issuer missing';
    case 'unnamed':
      return 'No subject name';
    case 'cycle':
      return 'Cycle detected';
    default:
      return 'Candidate';
  }
};

export interface CertificateHierarchyStatusBadgeStyle {
  variant: 'destructive' | 'secondary' | 'outline';
  className?: string;
}

export const getCertificateHierarchyStatusBadgeStyle = (
  status: CertificateHierarchyStatus,
): CertificateHierarchyStatusBadgeStyle => {
  if (status === 'gap' || status === 'cycle') {
    return { variant: 'destructive' };
  }
  if (status === 'ambiguous') {
    return { variant: 'secondary' };
  }
  if (status === 'verified') {
    return {
      variant: 'outline',
      className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    };
  }
  return { variant: 'outline' };
};
