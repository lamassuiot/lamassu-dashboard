import type { ApiRelatedCertificate } from '@/lib/ca-data';

/** Tooltip for the "Related Certificate" marker on certificate and CA views (RFC 9763). */
export const RELATED_CERTIFICATE_TITLE = 'Post-quantum: bound to a related certificate (RFC 9763)';
import { isValidPositiveDuration } from '@/lib/duration';

/** Form representation: hosts are edited as one-per-line text, max age as a duration string. */
export interface RelatedCertificateFormValues {
  enabled: boolean;
  allowedHosts: string;
  maxAge: string;
}

export const defaultRelatedCertificateValues: RelatedCertificateFormValues = {
  enabled: false,
  allowedHosts: '',
  maxAge: '',
};

/** Splits free text (newlines, commas or spaces) into unique, trimmed host names. */
export function parseAllowedHosts(text: string | undefined): string[] {
  const hosts = (text ?? '').split(/[\s,]+/).map(host => host.trim()).filter(Boolean);
  return Array.from(new Set(hosts));
}

/** An empty max age means "use the backend default"; otherwise it must be a positive duration. */
export function isValidRelatedCertMaxAge(value: string | undefined): boolean {
  const trimmed = (value ?? '').trim();
  return trimmed === '' || isValidPositiveDuration(trimmed);
}

export function relatedCertificateFromApi(api: ApiRelatedCertificate | null | undefined): RelatedCertificateFormValues {
  return {
    enabled: api?.enabled ?? false,
    allowedHosts: (api?.allowed_hosts ?? []).join('\n'),
    maxAge: api?.max_age ?? '',
  };
}

export function relatedCertificateToApi(values: RelatedCertificateFormValues | undefined): ApiRelatedCertificate {
  const maxAge = (values?.maxAge ?? '').trim();
  return {
    enabled: values?.enabled ?? false,
    allowed_hosts: parseAllowedHosts(values?.allowedHosts),
    ...(maxAge && { max_age: maxAge }),
  };
}
