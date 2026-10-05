import type { ApiSigningProfile } from '@/lib/ca-data';
import type { ApiRaEstSettings, ApiRaItem, RaCreationPayload } from '@/lib/dms-api';
import { isValidPositiveDuration } from '@/components/shared/DurationInput';
import {
  createDefaultEstAuthSettings,
  getEstAuthSettingsValidationErrors,
  includesValidationCa,
  normalizeEstAuthSettings,
  parseJsonObject,
} from '@/lib/dms-form';

export type RegistrationMode = 'JITP' | 'PRE_REGISTRATION';
/** Enrollment protocols the RA can expose. EST is the only one the DMS supports today. */
export const RA_PROTOCOLS = ['EST_RFC7030'] as const;
export type RaProtocol = typeof RA_PROTOCOLS[number];
export const protocolLabels: Record<RaProtocol, string> = { EST_RFC7030: 'EST · RFC 7030' };
export type IssuanceProfileMode = 'default' | 'existing' | 'inline';
export type ServerKeygenType = 'RSA' | 'ECDSA';

export interface RaFormValues {
  name: string;
  id: string;
  registrationMode: RegistrationMode;
  protocol: RaProtocol;
  tags: string[];
  deviceMetadataJson: string;
  deviceIcon: { name: string | null; color: string; bgColor: string };
  enrollmentCaId: string | null;
  issuanceProfileMode: IssuanceProfileMode;
  issuanceProfileId: string | null;
  allowReplaceableEnrollment: boolean;
  verifyCsrSignature: boolean;
  enrollmentAuth: ApiRaEstSettings;
  reenrollmentAuth: ApiRaEstSettings;
  revokeOnReenrollment: boolean;
  allowExpiredRenewal: boolean;
  reenrollmentDelta: string;
  preventiveDelta: string;
  criticalDelta: string;
  additionalValidationCaIds: string[];
  serverKeygen: { enabled: boolean; type: ServerKeygenType; spec: string };
  includeSystemCa: boolean;
  includeEnrollmentCa: boolean;
  managedCaIds: string[];
}

export const RA_FORM_SECTIONS = [
  'identity',
  'issuance',
  'devices',
  'protocol',
  'enrollment',
  'reenrollment',
  'keygen',
  'distribution',
] as const;
export type RaFormSectionId = typeof RA_FORM_SECTIONS[number];

export type RaFormField =
  | 'name'
  | 'id'
  | 'deviceIcon'
  | 'deviceMetadata'
  | 'enrollmentCa'
  | 'issuanceProfileId'
  | 'enrollmentAuth'
  | 'reenrollmentAuth'
  | 'reenrollmentDelta'
  | 'preventiveDelta'
  | 'criticalDelta';

export interface RaFormIssue {
  section: RaFormSectionId;
  severity: 'error' | 'warning';
  /** `required` issues stay hidden until the field is touched or a submit is attempted. */
  kind: 'required' | 'invalid';
  message: string;
  field?: RaFormField;
}

export const SERVER_KEYGEN_SPECS: Record<ServerKeygenType, Array<{ value: string; label: string }>> = {
  RSA: [
    { value: '2048', label: '2048 bit' },
    { value: '3072', label: '3072 bit' },
    { value: '4096', label: '4096 bit' },
  ],
  ECDSA: [
    { value: 'P-256', label: 'P-256' },
    { value: 'P-384', label: 'P-384' },
    { value: 'P-521', label: 'P-521' },
  ],
};

const DEFAULT_KEYGEN_SPEC: Record<ServerKeygenType, string> = { RSA: '4096', ECDSA: 'P-256' };
const CURVE_BITS: Record<string, number> = { 'P-256': 256, 'P-384': 384, 'P-521': 521 };
const BITS_CURVE: Record<number, string> = { 256: 'P-256', 384: 'P-384', 521: 'P-521' };

export function defaultKeygenSpec(type: ServerKeygenType): string {
  return DEFAULT_KEYGEN_SPEC[type];
}

export function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Derives a URL-safe RA ID from a display name ("Main IoT RA" → "main-iot-ra"). */
export function slugifyRaId(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  // Trim edge dashes without a backtracking-prone regex.
  let start = 0;
  let end = slug.length;
  while (start < end && slug[start] === '-') start++;
  while (end > start && slug[end - 1] === '-') end--;
  return slug.slice(start, end);
}

export function createDefaultRaFormValues(hue = crypto.getRandomValues(new Uint32Array(1))[0] % 360): RaFormValues {
  return {
    name: '',
    id: '',
    registrationMode: 'JITP',
    protocol: 'EST_RFC7030',
    tags: ['iot'],
    deviceMetadataJson: '{}',
    deviceIcon: { name: 'Router', color: hslToHex(hue, 80, 50), bgColor: hslToHex(hue, 80, 92) },
    enrollmentCaId: null,
    issuanceProfileMode: 'default',
    issuanceProfileId: null,
    allowReplaceableEnrollment: true,
    verifyCsrSignature: true,
    enrollmentAuth: createDefaultEstAuthSettings(true),
    reenrollmentAuth: createDefaultEstAuthSettings(false),
    revokeOnReenrollment: true,
    allowExpiredRenewal: true,
    reenrollmentDelta: '100d',
    preventiveDelta: '31d',
    criticalDelta: '7d',
    additionalValidationCaIds: [],
    serverKeygen: { enabled: false, type: 'RSA', spec: DEFAULT_KEYGEN_SPEC.RSA },
    includeSystemCa: true,
    includeEnrollmentCa: false,
    managedCaIds: [],
  };
}

/** Maps a stored RA to form values. The inline issuance profile, if any, is returned separately for its own form. */
export function raFormValuesFromApi(ra: ApiRaItem): { values: RaFormValues; inlineProfile: ApiSigningProfile | null } {
  const defaults = createDefaultRaFormValues(0);
  const { enrollment_settings: enrollment, reenrollment_settings: reenrollment, server_keygen_settings: keygen, ca_distribution_settings: distribution } = ra.settings;
  const provisioning = enrollment.device_provisioning_profile;
  const [iconColor, bgColor] = (provisioning.icon_color || '').split('-');
  const keygenType: ServerKeygenType = keygen.key?.type === 'ECDSA' ? 'ECDSA' : 'RSA';

  let issuanceProfileMode: IssuanceProfileMode = 'default';
  if (ra.settings.issuance_profile) issuanceProfileMode = 'inline';
  else if (ra.settings.issuance_profile_id) issuanceProfileMode = 'existing';

  return {
    inlineProfile: ra.settings.issuance_profile ?? null,
    values: {
      name: ra.name,
      id: ra.id,
      registrationMode: enrollment.registration_mode === 'PRE_REGISTRATION' ? 'PRE_REGISTRATION' : 'JITP',
      protocol: RA_PROTOCOLS.find(protocol => protocol === enrollment.protocol) ?? 'EST_RFC7030',
      tags: provisioning.tags ?? [],
      deviceMetadataJson: JSON.stringify(provisioning.metadata || {}, null, 2),
      deviceIcon: {
        name: provisioning.icon || null,
        color: iconColor || defaults.deviceIcon.color,
        bgColor: bgColor || defaults.deviceIcon.bgColor,
      },
      enrollmentCaId: enrollment.enrollment_ca || null,
      issuanceProfileMode,
      issuanceProfileId: issuanceProfileMode === 'existing' ? ra.settings.issuance_profile_id ?? null : null,
      allowReplaceableEnrollment: enrollment.enable_replaceable_enrollment,
      verifyCsrSignature: enrollment.verify_csr_signature ?? true,
      enrollmentAuth: normalizeEstAuthSettings(enrollment.est_rfc7030_settings, true),
      reenrollmentAuth: normalizeEstAuthSettings(reenrollment.est_rfc7030_settings, false),
      revokeOnReenrollment: reenrollment.revoke_on_reenrollment,
      allowExpiredRenewal: reenrollment.enable_expired_renewal,
      reenrollmentDelta: reenrollment.reenrollment_delta,
      preventiveDelta: reenrollment.preventive_delta,
      criticalDelta: reenrollment.critical_delta,
      additionalValidationCaIds: reenrollment.additional_validation_cas ?? [],
      serverKeygen: {
        enabled: keygen.enabled,
        type: keygenType,
        spec: !keygen.key
          ? DEFAULT_KEYGEN_SPEC[keygenType]
          : keygenType === 'RSA' ? String(keygen.key.bits) : BITS_CURVE[keygen.key.bits] ?? DEFAULT_KEYGEN_SPEC.ECDSA,
      },
      includeSystemCa: distribution.include_system_ca,
      includeEnrollmentCa: distribution.include_enrollment_ca,
      managedCaIds: distribution.managed_cas ?? [],
    },
  };
}

/** Builds the create/update payload. Callers must validate first: invalid metadata JSON throws. */
export function buildRaPayload(
  values: RaFormValues,
  options: { inlineProfile?: ApiSigningProfile; metadata?: Record<string, any> } = {},
): RaCreationPayload {
  const { serverKeygen } = values;
  const keygenBits = serverKeygen.type === 'ECDSA'
    ? CURVE_BITS[serverKeygen.spec] ?? 256
    : Number.parseInt(serverKeygen.spec, 10);

  return {
    name: values.name.trim(),
    id: values.id.trim(),
    metadata: options.metadata ?? {},
    settings: {
      ...(values.issuanceProfileMode === 'existing' && values.issuanceProfileId
        ? { issuance_profile_id: values.issuanceProfileId }
        : {}),
      ...(values.issuanceProfileMode === 'inline' && options.inlineProfile
        ? { issuance_profile: options.inlineProfile }
        : {}),
      enrollment_settings: {
        enrollment_ca: values.enrollmentCaId ?? '',
        protocol: values.protocol,
        registration_mode: values.registrationMode,
        enable_replaceable_enrollment: values.allowReplaceableEnrollment,
        verify_csr_signature: values.verifyCsrSignature,
        est_rfc7030_settings: values.enrollmentAuth,
        device_provisioning_profile: {
          icon: values.deviceIcon.name ?? '',
          icon_color: `${values.deviceIcon.color}-${values.deviceIcon.bgColor}`,
          metadata: parseJsonObject(values.deviceMetadataJson),
          tags: values.tags,
        },
      },
      reenrollment_settings: {
        est_rfc7030_settings: values.reenrollmentAuth,
        revoke_on_reenrollment: values.revokeOnReenrollment,
        enable_expired_renewal: values.allowExpiredRenewal,
        reenrollment_delta: values.reenrollmentDelta,
        preventive_delta: values.preventiveDelta,
        critical_delta: values.criticalDelta,
        additional_validation_cas: values.additionalValidationCaIds,
      },
      server_keygen_settings: {
        enabled: serverKeygen.enabled,
        ...(serverKeygen.enabled && { key: { type: serverKeygen.type, bits: keygenBits } }),
      },
      ca_distribution_settings: {
        include_enrollment_ca: values.includeEnrollmentCa,
        include_system_ca: values.includeSystemCa,
        managed_cas: values.managedCaIds,
      },
    },
  };
}

export function usesWebhook(settings: ApiRaEstSettings): boolean {
  return settings.auth_mode === 'EXTERNAL_WEBHOOK' || settings.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
}

export function usesClientCertificate(settings: ApiRaEstSettings): boolean {
  return settings.auth_mode === 'CLIENT_CERTIFICATE' || settings.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
}

function webhookTimeoutError(label: string, settings: ApiRaEstSettings): string | null {
  return usesWebhook(settings) && !isValidPositiveDuration(settings.external_webhook_settings?.config.call_timeout || '')
    ? `${label} webhook timeout must be a positive duration.`
    : null;
}

export interface RaFormValidationContext {
  isEditMode: boolean;
  enrollmentCaName?: string;
  /** Whether the selected Enrollment CA has a default issuance profile; undefined while unknown. */
  enrollmentCaHasDefaultProfile?: boolean;
  inlineProfileErrors?: readonly string[];
}

export function validateRaForm(values: RaFormValues, context: RaFormValidationContext): RaFormIssue[] {
  const issues: RaFormIssue[] = [];
  const error = (section: RaFormSectionId, kind: RaFormIssue['kind'], message: string, field?: RaFormField) =>
    issues.push({ section, severity: 'error', kind, message, field });
  const warning = (section: RaFormSectionId, message: string, field?: RaFormField) =>
    issues.push({ section, severity: 'warning', kind: 'invalid', message, field });

  if (!values.name.trim()) error('identity', 'required', 'RA name is required.', 'name');
  if (!context.isEditMode) {
    if (!values.id.trim()) error('identity', 'required', 'RA ID is required.', 'id');
    else if (/\s/.test(values.id.trim())) error('identity', 'invalid', 'RA ID cannot contain spaces.', 'id');
  }

  if (!values.enrollmentCaId) error('issuance', 'required', 'Select the Enrollment CA that signs device certificates.', 'enrollmentCa');
  if (values.issuanceProfileMode === 'existing' && !values.issuanceProfileId) {
    error('issuance', 'required', 'Select an issuance profile.', 'issuanceProfileId');
  }
  if (values.issuanceProfileMode === 'inline') {
    context.inlineProfileErrors?.forEach(message => error('issuance', 'invalid', message));
  }
  if (values.issuanceProfileMode === 'default' && values.enrollmentCaId && context.enrollmentCaHasDefaultProfile === false) {
    warning('issuance', 'The Enrollment CA has no default issuance profile.');
  }

  if (!values.deviceIcon.name) error('devices', 'required', 'Choose a device icon.', 'deviceIcon');
  try {
    parseJsonObject(values.deviceMetadataJson);
  } catch (err) {
    error('devices', 'invalid', err instanceof Error ? err.message : 'Device metadata must be valid JSON.', 'deviceMetadata');
  }

  getEstAuthSettingsValidationErrors('Enrollment authentication', values.enrollmentAuth, true)
    .forEach(message => error('enrollment', 'required', message, 'enrollmentAuth'));
  const enrollmentTimeout = webhookTimeoutError('Enrollment authentication', values.enrollmentAuth);
  if (enrollmentTimeout) error('enrollment', 'invalid', enrollmentTimeout, 'enrollmentAuth');

  getEstAuthSettingsValidationErrors('Re-enrollment authentication', values.reenrollmentAuth, true)
    .forEach(message => error('reenrollment', 'required', message, 'reenrollmentAuth'));
  const reenrollmentTimeout = webhookTimeoutError('Re-enrollment authentication', values.reenrollmentAuth);
  if (reenrollmentTimeout) error('reenrollment', 'invalid', reenrollmentTimeout, 'reenrollmentAuth');

  if (!isValidPositiveDuration(values.reenrollmentDelta)) error('reenrollment', 'invalid', 'Re-enrollment window must be a positive duration.', 'reenrollmentDelta');
  if (!isValidPositiveDuration(values.preventiveDelta)) error('reenrollment', 'invalid', 'Preventive renewal delta must be a positive duration.', 'preventiveDelta');
  if (!isValidPositiveDuration(values.criticalDelta)) error('reenrollment', 'invalid', 'Critical renewal delta must be a positive duration.', 'criticalDelta');

  if (values.enrollmentCaId) {
    const caName = context.enrollmentCaName ? `"${context.enrollmentCaName}"` : 'The Enrollment CA';
    if (usesClientCertificate(values.reenrollmentAuth) && !includesValidationCa(values.reenrollmentAuth, values.enrollmentCaId)) {
      warning('reenrollment', `${caName} is not a re-enrollment validation CA, so devices holding a certificate issued by it cannot re-enroll.`, 'reenrollmentAuth');
    }
    if (!values.additionalValidationCaIds.includes(values.enrollmentCaId)) {
      warning('reenrollment', `${caName} is not in the additional validation CAs used for re-enrollment.`);
    }
  }

  return issues;
}

export function isIssueVisible(issue: RaFormIssue, submitAttempted: boolean, touched: ReadonlySet<RaFormField>): boolean {
  return issue.kind === 'invalid' || submitAttempted || (!!issue.field && touched.has(issue.field));
}
