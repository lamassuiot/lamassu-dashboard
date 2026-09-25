import {
  COMPOSITE_MLDSA_PARAM_SET_INFO,
  ECDSA_CURVE_OPTIONS,
  MLDSA_SECURITY_LEVEL_OPTIONS,
  SLHDSA_PARAM_SET_INFO,
} from '@/lib/form-options';
import type { ApiCryptoEngine, ApiKeyTypeDetail } from '@/types/crypto-engine';

export interface CryptoSelectOption {
  value: string;
  label: string;
  /** Section this option belongs to, e.g. "T (Traditional)". Used to render a grouped select. */
  group?: string;
  /** True when the currently selected crypto engine doesn't support this option. */
  disabled?: boolean;
}

/**
 * The full set of key types a Lamassu KMS engine can ever report, grouped the
 * same way as the Algorithm filter on the KMS Keys list page. Used to render
 * every possible key type up front, disabling the ones the currently
 * selected engine doesn't support instead of omitting them.
 */
const KEY_TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: 'T (Traditional)', types: ['RSA', 'ECDSA', 'Ed25519'] },
  { label: 'PQ (Pure PQC)', types: ['ML-DSA', 'SLH-DSA'] },
  { label: 'PQ/T (Hybrid)', types: ['Composite-ML-DSA-RSA', 'Composite-ML-DSA-ECDSA', 'Composite-ML-DSA-Ed25519'] },
];

const KEY_SPEC_LABELS: Record<string, string> = {
  RSA: 'RSA Key Size',
  ECDSA: 'ECDSA Curve',
  'ML-DSA': 'ML-DSA Security Level',
  'SLH-DSA': 'SLH-DSA Parameter Set',
  'Composite-ML-DSA': 'Composite Parameter Set',
  'Composite-ML-DSA-RSA': 'Composite Parameter Set',
  'Composite-ML-DSA-ECDSA': 'Composite Parameter Set',
  'Composite-ML-DSA-Ed25519': 'Composite Parameter Set',
  Ed25519: 'Ed25519 Key Size',
};

const DEFAULT_SPEC_BY_KEY_TYPE: Record<string, string> = {
  RSA: '2048',
  ECDSA: 'P-256',
  'ML-DSA': 'ML-DSA-65',
  'SLH-DSA': '1',
  'Composite-ML-DSA': '1',
  'Composite-ML-DSA-RSA': '1',
  'Composite-ML-DSA-ECDSA': '9',
  'Composite-ML-DSA-Ed25519': '14',
  Ed25519: '256',
};

const normalizeCurveValue = (rawValue: string): string => {
  const trimmedValue = rawValue.trim();

  if (ECDSA_CURVE_OPTIONS.some((option) => option.value === trimmedValue)) {
    return trimmedValue;
  }

  const digits = trimmedValue.replace(/^P-/, '');
  const matchedCurve = ECDSA_CURVE_OPTIONS.find((option) => option.value === `P-${digits}`);
  return matchedCurve?.value ?? trimmedValue;
};

const normalizeMlDsaValue = (rawValue: string): string => {
  const trimmedValue = rawValue.trim();
  const digits = trimmedValue.replace(/^ML-DSA-/, '');
  const matchedOption = MLDSA_SECURITY_LEVEL_OPTIONS.find((option) => option.value.endsWith(`-${digits}`));
  return matchedOption?.value ?? trimmedValue;
};

export function getSupportedKeyTypeOptions(engine?: ApiCryptoEngine | null): CryptoSelectOption[] {
  return (engine?.supported_key_types ?? []).map((keyType) => ({
    value: keyType.type,
    label: keyType.type,
  }));
}

export function getSupportedKeyTypeValues(engine?: ApiCryptoEngine | null): string[] {
  return (engine?.supported_key_types ?? []).map((keyType) => keyType.type);
}

/**
 * Every possible key type, grouped by algorithm family (matching the KMS
 * Keys list's Algorithm filter), with types the given engine doesn't
 * support marked `disabled` rather than omitted. Pass no engine (or `null`)
 * to disable everything, e.g. before an engine has been selected.
 */
export function getAllKeyTypeOptions(engine?: ApiCryptoEngine | null): CryptoSelectOption[] {
  const supportedTypes = new Set(
    (engine?.supported_key_types ?? []).map((keyType) => keyType.type.toUpperCase()),
  );

  return KEY_TYPE_GROUPS.flatMap((group) =>
    group.types.map((type) => ({
      value: type,
      label: type,
      group: group.label,
      disabled: !supportedTypes.has(type.toUpperCase()),
    })),
  );
}

export function getKeyTypeDetails(
  engine: ApiCryptoEngine | null | undefined,
  keyType: string,
): ApiKeyTypeDetail | undefined {
  return engine?.supported_key_types.find((candidate) => candidate.type === keyType);
}

export function getKeySpecOptions(
  keyType: string,
  keyTypeDetails?: ApiKeyTypeDetail,
): CryptoSelectOption[] {
  if (!keyTypeDetails) {
    return [];
  }

  return keyTypeDetails.sizes.map((size) => {
    const rawValue = String(size).trim();

    if (keyType === 'RSA') {
      return { value: rawValue, label: `${rawValue} bit` };
    }

    if (keyType === 'ECDSA') {
      const curveValue = normalizeCurveValue(rawValue);
      const option = ECDSA_CURVE_OPTIONS.find((candidate) => candidate.value === curveValue);
      if (!option) {
        return { value: curveValue, label: curveValue };
      }

      return option;
    }

    if (keyType === 'ML-DSA') {
      const normalizedValue = normalizeMlDsaValue(rawValue);
      const option = MLDSA_SECURITY_LEVEL_OPTIONS.find((candidate) => candidate.value === normalizedValue);
      return option ?? { value: normalizedValue, label: normalizedValue };
    }

    if (keyType === 'SLH-DSA') {
      const info = SLHDSA_PARAM_SET_INFO[rawValue];
      return {
        value: rawValue,
        label: info
          ? `${rawValue} - ${info.name} (${info.hash}, ${info.security}, ${info.speed})`
          : rawValue,
      };
    }

    if (keyType.toUpperCase().startsWith('COMPOSITE')) {
      const info = COMPOSITE_MLDSA_PARAM_SET_INFO[rawValue];
      return {
        value: rawValue,
        label: info ? `${rawValue} - ${info.name}` : rawValue,
      };
    }

    if (keyType === 'Ed25519') {
      return { value: rawValue, label: `${rawValue} bit` };
    }

    return { value: rawValue, label: rawValue };
  });
}

export function getKeySpecLabel(keyType: string, prefix?: string): string {
  const label = KEY_SPEC_LABELS[keyType] ?? 'Key Specification';
  return prefix ? `${prefix} ${label}` : label;
}

export function getPreferredKeySpecValue(keyType: string, options: CryptoSelectOption[]): string {
  if (options.length === 0) {
    return '';
  }

  const defaultValue = DEFAULT_SPEC_BY_KEY_TYPE[keyType];
  if (defaultValue && options.some((option) => option.value === defaultValue)) {
    return defaultValue;
  }

  return options[0].value;
}

export function formatKeyTypeDisplay(algorithm: string, size: string): string {
  const rawSize = String(size).trim();

  if (algorithm === 'RSA' || algorithm === 'Ed25519') {
    return `${algorithm} ${rawSize} bit`;
  }

  if (algorithm === 'ECDSA') {
    const curveValue = normalizeCurveValue(rawSize);
    const option = ECDSA_CURVE_OPTIONS.find((candidate) => candidate.value === curveValue);
    return `${algorithm} ${option?.label ?? curveValue}`;
  }

  if (algorithm === 'ML-DSA') {
    const normalizedValue = normalizeMlDsaValue(rawSize);
    const option = MLDSA_SECURITY_LEVEL_OPTIONS.find((candidate) => candidate.value === normalizedValue);
    return option?.label ?? `${algorithm} ${normalizedValue}`;
  }

  if (algorithm === 'SLH-DSA') {
    const info = SLHDSA_PARAM_SET_INFO[rawSize];
    return info ? `${algorithm} ${info.name} (${info.hash}, ${info.security}, ${info.speed})` : `${algorithm} ${rawSize}`;
  }

  if (algorithm.toUpperCase().startsWith('COMPOSITE')) {
    const info = COMPOSITE_MLDSA_PARAM_SET_INFO[rawSize];
    return `${algorithm} ${info ? info.name : rawSize}`;
  }

  return `${algorithm} ${rawSize}`;
}

/** Composite parameter-set IDs 1-8 belong to the RSA family, 9-13 to ECDSA, 14-15 to Ed25519. */
function compositeAlgorithmIdFor(paramSetId: string): string {
  const id = Number.parseInt(paramSetId, 10);
  if (id >= 14) return `COMPOSITE_MLDSA_ED25519_${paramSetId}`;
  if (id >= 9) return `COMPOSITE_MLDSA_ECDSA_${paramSetId}`;
  return `COMPOSITE_MLDSA_RSA_${paramSetId}`;
}

const SIGNATURE_ALGORITHM_LABELS: Record<string, string> = {
  RSASSA_PSS_SHA_256: 'RSA-PSS SHA-256',
  RSASSA_PSS_SHA_384: 'RSA-PSS SHA-384',
  RSASSA_PSS_SHA_512: 'RSA-PSS SHA-512',
  RSASSA_PKCS1_V1_5_SHA_256: 'RSA PKCS#1 v1.5 SHA-256',
  RSASSA_PKCS1_V1_5_SHA_384: 'RSA PKCS#1 v1.5 SHA-384',
  RSASSA_PKCS1_V1_5_SHA_512: 'RSA PKCS#1 v1.5 SHA-512',
  ECDSA_SHA_256: 'ECDSA SHA-256',
  ECDSA_SHA_384: 'ECDSA SHA-384',
  ECDSA_SHA_512: 'ECDSA SHA-512',
  MLDSA_44: 'ML-DSA-44',
  MLDSA_65: 'ML-DSA-65',
  MLDSA_87: 'ML-DSA-87',
  Ed25519_PURE: 'Ed25519',
  ...Object.fromEntries(
    Object.entries(SLHDSA_PARAM_SET_INFO).map(([id, info]) => [
      `SLHDSA_${id}`,
      `SLH-DSA ${info.name} (${info.hash}, ${info.security}, ${info.speed})`,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(COMPOSITE_MLDSA_PARAM_SET_INFO).map(([id, info]) => [
      compositeAlgorithmIdFor(id),
      `Composite-ML-DSA ${info.name}`,
    ]),
  ),
};

export function getSignatureAlgorithmLabel(algo: string): string {
  return SIGNATURE_ALGORITHM_LABELS[algo] ?? algo;
}

export function parseKeySpecToApiSize(keyType: string, keySpec: string): number {
  if (keyType === 'ECDSA') {
    return Number.parseInt(keySpec.replace(/^P-/, ''), 10);
  }

  if (keyType === 'ML-DSA') {
    return Number.parseInt(keySpec.replace(/^ML-DSA-/, ''), 10);
  }

  return Number.parseInt(keySpec, 10);
}
