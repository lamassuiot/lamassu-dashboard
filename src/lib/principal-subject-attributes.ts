import type { PrincipalType, SubjectAttributeConfig } from '@/types/authz';

export type SubjectAttributeRow = {
  id: string;
  key: string;
  value: string;
};

export const X509_SUBJECT_ATTRIBUTE_SOURCES = [
  'x509.subject.cn',
  'x509.subject.common_name',
  'x509.serial_number',
] as const;

export const newSubjectAttributeRow = (key = '', value = ''): SubjectAttributeRow => ({
  id: crypto.randomUUID(),
  key,
  value,
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const subjectAttributeRowsFromRecord = (value: unknown): SubjectAttributeRow[] => {
  if (!isPlainRecord(value)) return [];
  return Object.entries(value)
    .filter(([, entryValue]) => typeof entryValue === 'string' || typeof entryValue === 'number' || typeof entryValue === 'boolean')
    .map(([key, entryValue]) => newSubjectAttributeRow(key, String(entryValue)));
};

export const subjectAttributeRowsToRecord = (rows: SubjectAttributeRow[]): Record<string, string> | undefined => {
  const entries = rows
    .map((row) => [row.key.trim(), row.value.trim()] as const)
    .filter(([key, value]) => key && value);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

export const validateSubjectAttributeRows = (
  staticRows: SubjectAttributeRow[],
  mappingRows: SubjectAttributeRow[],
  type: PrincipalType,
): string | null => {
  const validateRows = (rows: SubjectAttributeRow[], label: string) => {
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const hasKey = !!row.key.trim();
      const hasValue = !!row.value.trim();
      if (hasKey !== hasValue) return `${label} ${index + 1}: key and value are both required`;
    }
    return null;
  };

  const staticError = validateRows(staticRows, 'Subject attribute');
  if (staticError) return staticError;

  const mappingError = validateRows(mappingRows, 'Derived subject attribute');
  if (mappingError) return mappingError;

  if (type === 'oidc') {
    const invalidOidcMapping = mappingRows.find((row) => row.value.trim() && !row.value.trim().startsWith('oidc.claim.'));
    if (invalidOidcMapping) return 'OIDC derived subject attribute sources must start with oidc.claim.';
  }

  return null;
};

export const withSubjectAttributeConfig = <T extends Record<string, unknown>>(
  baseConfig: T,
  staticRows: SubjectAttributeRow[],
  mappingRows: SubjectAttributeRow[],
): T & SubjectAttributeConfig => {
  const subjectAttributes = subjectAttributeRowsToRecord(staticRows);
  const subjectAttributeMappings = subjectAttributeRowsToRecord(mappingRows);
  const nextConfig = { ...baseConfig } as T & SubjectAttributeConfig;

  if (subjectAttributes) nextConfig.subject_attributes = subjectAttributes;
  else delete nextConfig.subject_attributes;

  if (subjectAttributeMappings) nextConfig.subject_attribute_mappings = subjectAttributeMappings;
  else delete nextConfig.subject_attribute_mappings;

  return nextConfig;
};

export const principalHasSubjectAttribute = (authConfig: unknown, attributeName: string): boolean => {
  if (!isPlainRecord(authConfig)) return false;
  const staticAttributes = authConfig.subject_attributes;
  const derivedAttributes = authConfig.subject_attribute_mappings;

  return (
    (isPlainRecord(staticAttributes) && typeof staticAttributes[attributeName] === 'string' && !!String(staticAttributes[attributeName]).trim()) ||
    (isPlainRecord(derivedAttributes) && typeof derivedAttributes[attributeName] === 'string' && !!String(derivedAttributes[attributeName]).trim())
  );
};
