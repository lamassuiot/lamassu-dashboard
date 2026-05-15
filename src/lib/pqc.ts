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
