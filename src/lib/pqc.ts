import { COMPOSITE_MLDSA_PARAM_SET_INFO, SLHDSA_PARAM_SET_INFO } from '@/lib/form-options';

const PQC_ALGORITHM_PREFIXES = [
  'ML-DSA',
  'ML_DSA',
  'MLDSA',
  'SLH-DSA',
  'SLH_DSA',
  'SLHDSA',
  'COMPOSITE',
  'SPHINCS',
  'DILITHIUM',
  'FALCON',
];

export function isPqcAlgorithm(algorithm?: string | null): boolean {
  const normalizedAlgorithm = algorithm?.trim().toUpperCase();

  if (!normalizedAlgorithm) {
    return false;
  }

  return PQC_ALGORITHM_PREFIXES.some((prefix) => normalizedAlgorithm.startsWith(prefix));
}

/** T = Traditional, PQ = Pure post-quantum, PQ/T = Hybrid (composite) post-quantum. */
export type AlgorithmFamily = 'T' | 'PQ' | 'PQ/T';

export function getAlgorithmFamily(algorithm?: string | null): AlgorithmFamily {
  const normalizedAlgorithm = algorithm?.trim().toUpperCase();
  if (!normalizedAlgorithm) return 'T';
  if (normalizedAlgorithm.startsWith('COMPOSITE')) return 'PQ/T';
  if (isPqcAlgorithm(normalizedAlgorithm)) return 'PQ';
  return 'T';
}

export const ALGORITHM_FAMILY_LABELS: Record<AlgorithmFamily, string> = {
  T: 'Traditional',
  PQ: 'Pure post-quantum',
  'PQ/T': 'Hybrid post-quantum',
};

/** Renders an SLH-DSA parameter-set info entry as `SLH-DSA-SHAKE-128f`. */
function formatSlhDsaName(paramSetId: string): string | undefined {
  const info = SLHDSA_PARAM_SET_INFO[paramSetId];
  return info ? `SLH-DSA-${info.name.replaceAll('_', '-')}` : undefined;
}

export function formatKmsKeyTypeDisplay(algorithm: string, size: string | number): string {
  const normalizedAlgorithm = algorithm.trim().toUpperCase().replaceAll('_', '-');
  const sizeValue = String(size);

  if (normalizedAlgorithm.startsWith('COMPOSITE')) {
    const compositeName = COMPOSITE_MLDSA_PARAM_SET_INFO[sizeValue]?.name;
    return compositeName ? `Composite-Signature ${compositeName}` : `${algorithm} ${sizeValue}`;
  }

  if (normalizedAlgorithm.startsWith('MLDSA') || normalizedAlgorithm.startsWith('ML-DSA')) {
    const parameterSet = sizeValue.match(/^(44|65|87)$/)?.[1]
      ?? normalizedAlgorithm.match(/(?:MLDSA|ML-DSA)-?(44|65|87)/)?.[1];
    return parameterSet ? `ML-DSA-${parameterSet}` : `${algorithm} ${sizeValue}`;
  }

  if (normalizedAlgorithm.startsWith('SLH-DSA') || normalizedAlgorithm.startsWith('SLHDSA')) {
    return formatSlhDsaName(sizeValue) || `${algorithm} ${sizeValue}`;
  }

  if (normalizedAlgorithm === 'ED25519') return `Ed25519 ${sizeValue} bit`;
  return `${algorithm} ${sizeValue} bit`;
}

export function formatSignatureAlgorithm(algorithm: string): string {
  const normalizedAlgorithm = algorithm.trim().toUpperCase().replaceAll('_', '-');
  const compositeParameterSet = normalizedAlgorithm.match(/COMPOSITE.*-(\d+)$/)?.[1];

  if (compositeParameterSet) {
    const compositeName = COMPOSITE_MLDSA_PARAM_SET_INFO[compositeParameterSet]?.name;
    if (compositeName) return `Composite-Signature ${compositeName}`;
  }

  const mlDsaParameterSet = normalizedAlgorithm.match(/(?:MLDSA|ML-DSA)-?(44|65|87)$/)?.[1];
  if (mlDsaParameterSet) return `ML-DSA-${mlDsaParameterSet}`;

  const slhDsaParameterSet = normalizedAlgorithm.match(/(?:SLHDSA|SLH-DSA)-?(\d+)$/)?.[1];
  if (slhDsaParameterSet) {
    const slhDsaName = formatSlhDsaName(slhDsaParameterSet);
    if (slhDsaName) return slhDsaName;
  }

  if (normalizedAlgorithm === 'ED25519') return 'Ed25519';

  return algorithm;
}
