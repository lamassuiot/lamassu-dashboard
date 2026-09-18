import { describe, expect, it } from 'vitest';

import type { ApiCryptoEngine } from '@/types/crypto-engine';

import {
  getAllKeyTypeOptions,
  getKeySpecLabel,
  getKeySpecOptions,
  getKeyTypeDetails,
  getPreferredKeySpecValue,
  getSupportedKeyTypeOptions,
  parseKeySpecToApiSize,
} from './crypto-key-fields';

const mockEngine: ApiCryptoEngine = {
  id: 'engine-1',
  name: 'Test Engine',
  type: 'PKCS11',
  provider: 'softHSM',
  security_level: 1,
  metadata: {},
  default: false,
  supported_key_types: [
    { type: 'RSA', sizes: [4096, 2048] },
    { type: 'ECDSA', sizes: [256, 384] },
    { type: 'ML-DSA', sizes: [44, 65] },
    { type: 'SLH-DSA', sizes: [1] },
    { type: 'Composite-ML-DSA-RSA', sizes: [1] },
    { type: 'Composite-ML-DSA-ECDSA', sizes: [9] },
    { type: 'Composite-ML-DSA-Ed25519', sizes: [14] },
  ],
};

describe('crypto-key-fields', () => {
  it('builds key type options from the selected engine', () => {
    expect(getSupportedKeyTypeOptions(mockEngine)).toEqual([
      { value: 'RSA', label: 'RSA' },
      { value: 'ECDSA', label: 'ECDSA' },
      { value: 'ML-DSA', label: 'ML-DSA' },
      { value: 'SLH-DSA', label: 'SLH-DSA' },
      { value: 'Composite-ML-DSA-RSA', label: 'Composite-ML-DSA-RSA' },
      { value: 'Composite-ML-DSA-ECDSA', label: 'Composite-ML-DSA-ECDSA' },
      { value: 'Composite-ML-DSA-Ed25519', label: 'Composite-ML-DSA-Ed25519' },
    ]);
  });

  it('lists every key type grouped by family, disabling ones the engine does not support', () => {
    const options = getAllKeyTypeOptions(mockEngine);

    expect(options.map((o) => [o.value, o.group, o.disabled])).toEqual([
      ['RSA', 'T (Traditional)', false],
      ['ECDSA', 'T (Traditional)', false],
      ['Ed25519', 'T (Traditional)', true],
      ['ML-DSA', 'PQ (Pure PQC)', false],
      ['SLH-DSA', 'PQ (Pure PQC)', false],
      ['Composite-ML-DSA-RSA', 'PQ/T (Hybrid)', false],
      ['Composite-ML-DSA-ECDSA', 'PQ/T (Hybrid)', false],
      ['Composite-ML-DSA-Ed25519', 'PQ/T (Hybrid)', false],
    ]);
  });

  it('names composite ML-DSA-ECDSA and ML-DSA-Ed25519 key specs from the shared parameter-set table, not bare numbers', () => {
    const ecdsaSpecs = getKeySpecOptions('Composite-ML-DSA-ECDSA', getKeyTypeDetails(mockEngine, 'Composite-ML-DSA-ECDSA'));
    expect(ecdsaSpecs).toEqual([{ value: '9', label: '9 - MLDSA44-ECDSA-P256-SHA256' }]);

    const ed25519Specs = getKeySpecOptions('Composite-ML-DSA-Ed25519', getKeyTypeDetails(mockEngine, 'Composite-ML-DSA-Ed25519'));
    expect(ed25519Specs).toEqual([{ value: '14', label: '14 - MLDSA44-Ed25519-SHA512' }]);
  });

  it('disables every key type when no engine is selected', () => {
    expect(getAllKeyTypeOptions(undefined).every((o) => o.disabled)).toBe(true);
  });

  it('normalizes ECDSA and ML-DSA size options to shared canonical values', () => {
    const ecdsaOptions = getKeySpecOptions('ECDSA', getKeyTypeDetails(mockEngine, 'ECDSA'));
    const mlDsaOptions = getKeySpecOptions('ML-DSA', getKeyTypeDetails(mockEngine, 'ML-DSA'));

    expect(ecdsaOptions).toEqual([
      { value: 'P-256', label: 'P-256 (NIST P-256, secp256r1)' },
      { value: 'P-384', label: 'P-384 (NIST P-384, secp384r1)' },
    ]);
    expect(mlDsaOptions).toEqual([
      { value: 'ML-DSA-44', label: 'ML-DSA-44' },
      { value: 'ML-DSA-65', label: 'ML-DSA-65' },
    ]);
  });

  it('uses shared labels and preferred default values', () => {
    const rsaOptions = getKeySpecOptions('RSA', getKeyTypeDetails(mockEngine, 'RSA'));

    expect(getKeySpecLabel('ECDSA')).toBe('ECDSA Curve');
    expect(getKeySpecLabel('ML-DSA', 'Inner')).toBe('Inner ML-DSA Security Level');
    expect(getPreferredKeySpecValue('RSA', rsaOptions)).toBe('2048');
    expect(rsaOptions).toEqual([
      { value: '4096', label: '4096 bit' },
      { value: '2048', label: '2048 bit' },
    ]);
  });

  it('formats parameter-set based algorithms consistently', () => {
    const slhDsaOptions = getKeySpecOptions('SLH-DSA', getKeyTypeDetails(mockEngine, 'SLH-DSA'));
    const compositeOptions = getKeySpecOptions(
      'Composite-ML-DSA-RSA',
      getKeyTypeDetails(mockEngine, 'Composite-ML-DSA-RSA'),
    );

    expect(slhDsaOptions[0].label).toContain('SHA2_128s');
    expect(compositeOptions[0]).toEqual({
      value: '1',
      label: '1 - MLDSA44-RSA2048-PSS-SHA256',
    });
  });

  it('parses normalized key spec values back to API sizes', () => {
    expect(parseKeySpecToApiSize('RSA', '2048')).toBe(2048);
    expect(parseKeySpecToApiSize('ECDSA', 'P-384')).toBe(384);
    expect(parseKeySpecToApiSize('ML-DSA', 'ML-DSA-65')).toBe(65);
    expect(parseKeySpecToApiSize('SLH-DSA', '3')).toBe(3);
  });

  it('adds security guidance to Ed25519 options', () => {
    expect(getKeySpecOptions('Ed25519', { type: 'Ed25519', sizes: [256] })).toEqual([
      { value: '256', label: '256 bit' },
    ]);
  });
});
