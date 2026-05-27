import { describe, expect, it } from 'vitest';

import type { ApiCryptoEngine } from '@/types/crypto-engine';

import {
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
    ]);
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
