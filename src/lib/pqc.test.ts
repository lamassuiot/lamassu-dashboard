import { describe, expect, it } from 'vitest';

import { isPqcAlgorithm } from './pqc';

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
