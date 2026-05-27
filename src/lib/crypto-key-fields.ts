import {
  COMPOSITE_MLDSA_RSA_PARAM_SET_INFO,
  ECDSA_CURVE_OPTIONS,
  MLDSA_SECURITY_LEVEL_OPTIONS,
  SLHDSA_PARAM_SET_INFO,
} from '@/lib/form-options';
import type { ApiCryptoEngine, ApiKeyTypeDetail } from '@/types/crypto-engine';

export interface CryptoSelectOption {
  value: string;
  label: string;
}

const KEY_SPEC_LABELS: Record<string, string> = {
  RSA: 'RSA Key Size',
  ECDSA: 'ECDSA Curve',
  'ML-DSA': 'ML-DSA Security Level',
  'SLH-DSA': 'SLH-DSA Parameter Set',
  'Composite-ML-DSA-RSA': 'Composite Parameter Set',
  Ed25519: 'Ed25519 Key Size',
};

const DEFAULT_SPEC_BY_KEY_TYPE: Record<string, string> = {
  RSA: '2048',
  ECDSA: 'P-256',
  'ML-DSA': 'ML-DSA-65',
  'SLH-DSA': '1',
  'Composite-ML-DSA-RSA': '1',
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

    if (keyType === 'Composite-ML-DSA-RSA') {
      const info = COMPOSITE_MLDSA_RSA_PARAM_SET_INFO[rawValue];
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

export function parseKeySpecToApiSize(keyType: string, keySpec: string): number {
  if (keyType === 'ECDSA') {
    return Number.parseInt(keySpec.replace(/^P-/, ''), 10);
  }

  if (keyType === 'ML-DSA') {
    return Number.parseInt(keySpec.replace(/^ML-DSA-/, ''), 10);
  }

  return Number.parseInt(keySpec, 10);
}
