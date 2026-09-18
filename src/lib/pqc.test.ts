import { describe, expect, it } from 'vitest';

import { formatKmsKeyTypeDisplay, formatSignatureAlgorithm, getAlgorithmFamily, isPqcAlgorithm } from './pqc';

describe('isPqcAlgorithm', () => {
  it('detects supported post-quantum algorithm names and variants', () => {
    expect(isPqcAlgorithm('ML-DSA')).toBe(true);
    expect(isPqcAlgorithm('ML-DSA-65')).toBe(true);
    expect(isPqcAlgorithm('MLDSA_65')).toBe(true);
    expect(isPqcAlgorithm('ml_dsa_87')).toBe(true);
  });

  it('does not mark classic algorithms as post-quantum', () => {
    expect(isPqcAlgorithm('RSA')).toBe(false);
    expect(isPqcAlgorithm('ECDSA')).toBe(false);
    expect(isPqcAlgorithm('Ed25519')).toBe(false);
    expect(isPqcAlgorithm(null)).toBe(false);
  });
});

describe('PQC key display helpers', () => {
  it('formats composite parameter sets with their concrete algorithm name', () => {
    expect(formatKmsKeyTypeDisplay('Composite-ML-DSA-ECDSA', 9))
      .toBe('Composite-Signature MLDSA44-ECDSA-P256-SHA256');
  });

  it('formats composite signature algorithm identifiers for selection controls', () => {
    expect(formatSignatureAlgorithm('COMPOSITE_MLDSA_ECDSA_9'))
      .toBe('Composite-Signature MLDSA44-ECDSA-P256-SHA256');
  });

  it('formats SLH-DSA parameter sets with their concrete algorithm name', () => {
    expect(formatKmsKeyTypeDisplay('SLH-DSA', 2)).toBe('SLH-DSA-SHAKE-128s');
    expect(formatKmsKeyTypeDisplay('SLH-DSA', 4)).toBe('SLH-DSA-SHAKE-128f');
  });

  it('identifies pure and hybrid post-quantum algorithms', () => {
    expect(isPqcAlgorithm('ML-DSA')).toBe(true);
    expect(isPqcAlgorithm('Composite-ML-DSA-ECDSA')).toBe(true);
    expect(isPqcAlgorithm('Ed25519')).toBe(false);
  });

  it('classifies algorithms into Traditional / Pure PQ / Hybrid PQ families', () => {
    expect(getAlgorithmFamily('ECDSA (256 bit)')).toBe('T');
    expect(getAlgorithmFamily('RSA (2048 bit)')).toBe('T');
    expect(getAlgorithmFamily('SLH-DSA (4)')).toBe('PQ');
    expect(getAlgorithmFamily('ML-DSA (65)')).toBe('PQ');
    expect(getAlgorithmFamily('Composite-ML-DSA-ECDSA (9)')).toBe('PQ/T');
  });
});
