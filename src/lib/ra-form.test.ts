import { describe, expect, it } from 'vitest';

import type { ApiRaItem } from '@/lib/dms-api';
import { withDefaultValidationCa } from '@/lib/dms-form';
import {
  buildRaPayload,
  createDefaultRaFormValues,
  isIssueVisible,
  raFormValuesFromApi,
  slugifyRaId,
  validateRaForm,
  type RaFormValues,
} from './ra-form';

function validValues(overrides: Partial<RaFormValues> = {}): RaFormValues {
  const defaults = createDefaultRaFormValues(200);
  return {
    ...defaults,
    name: 'Factory RA',
    id: 'factory-ra',
    enrollmentCaId: 'ca-1',
    additionalValidationCaIds: ['ca-1'],
    enrollmentAuth: withDefaultValidationCa(defaults.enrollmentAuth, 'bootstrap-ca'),
    reenrollmentAuth: withDefaultValidationCa(defaults.reenrollmentAuth, 'ca-1'),
    ...overrides,
  };
}

const context = { isEditMode: false, enrollmentCaHasDefaultProfile: true };

describe('slugifyRaId', () => {
  it('derives a URL-safe identifier from a display name', () => {
    expect(slugifyRaId('Main IoT Enrollment Service')).toBe('main-iot-enrollment-service');
    expect(slugifyRaId('  Fábrica Norte / Línea #2 ')).toBe('fabrica-norte-linea-2');
    expect(slugifyRaId('---')).toBe('');
  });
});

describe('validateRaForm', () => {
  it('accepts a complete form', () => {
    expect(validateRaForm(validValues(), context)).toEqual([]);
  });

  it('reports required fields against their sections', () => {
    const issues = validateRaForm(createDefaultRaFormValues(0), context);
    const required = issues.filter(issue => issue.kind === 'required').map(issue => [issue.section, issue.field]);

    expect(required).toEqual(expect.arrayContaining([
      ['identity', 'name'],
      ['identity', 'id'],
      ['issuance', 'enrollmentCa'],
      ['enrollment', 'enrollmentAuth'],
      ['reenrollment', 'reenrollmentAuth'],
    ]));
  });

  it('does not require an ID in edit mode', () => {
    const issues = validateRaForm(validValues({ id: '' }), { ...context, isEditMode: true });
    expect(issues.some(issue => issue.field === 'id')).toBe(false);
  });

  it('flags invalid metadata and durations immediately', () => {
    const issues = validateRaForm(validValues({ deviceMetadataJson: '[1]', criticalDelta: '0d' }), context);

    expect(issues.filter(issue => issue.severity === 'error').map(issue => [issue.field, issue.kind])).toEqual([
      ['deviceMetadata', 'invalid'],
      ['criticalDelta', 'invalid'],
    ]);
  });

  it('warns when the Enrollment CA is not trusted for re-enrollment', () => {
    const issues = validateRaForm(
      validValues({ additionalValidationCaIds: [], reenrollmentAuth: withDefaultValidationCa(createDefaultRaFormValues(0).reenrollmentAuth, 'other') }),
      { ...context, enrollmentCaName: 'Device CA' },
    );

    expect(issues.map(issue => issue.severity)).toEqual(['warning', 'warning']);
    expect(issues[0].message).toContain('"Device CA"');
  });

  it('warns when the default profile mode has no profile to resolve', () => {
    const issues = validateRaForm(validValues(), { ...context, enrollmentCaHasDefaultProfile: false });
    expect(issues).toEqual([expect.objectContaining({ section: 'issuance', severity: 'warning' })]);
  });
});

describe('isIssueVisible', () => {
  const required = { section: 'identity', severity: 'error', kind: 'required', message: 'x', field: 'name' } as const;

  it('hides required issues until touched or submitted', () => {
    expect(isIssueVisible(required, false, new Set())).toBe(false);
    expect(isIssueVisible(required, false, new Set(['name']))).toBe(true);
    expect(isIssueVisible(required, true, new Set())).toBe(true);
    expect(isIssueVisible({ ...required, kind: 'invalid' }, false, new Set())).toBe(true);
  });
});

describe('buildRaPayload', () => {
  it('maps form values to the DMS API shape', () => {
    const payload = buildRaPayload(validValues({
      deviceMetadataJson: '{"site":"north"}',
      serverKeygen: { enabled: true, type: 'ECDSA', spec: 'P-384' },
      issuanceProfileMode: 'existing',
      issuanceProfileId: 'profile-1',
    }));

    expect(payload.id).toBe('factory-ra');
    expect(payload.settings.issuance_profile_id).toBe('profile-1');
    expect(payload.settings.issuance_profile).toBeUndefined();
    expect(payload.settings.enrollment_settings).toMatchObject({
      enrollment_ca: 'ca-1',
      protocol: 'EST_RFC7030',
      device_provisioning_profile: { metadata: { site: 'north' }, tags: ['iot'] },
    });
    expect(payload.settings.server_keygen_settings).toEqual({ enabled: true, key: { type: 'ECDSA', bits: 384 } });
  });

  it('omits the key spec when server key generation is disabled', () => {
    expect(buildRaPayload(validValues()).settings.server_keygen_settings).toEqual({ enabled: false });
  });
});

describe('raFormValuesFromApi', () => {
  it('round-trips through buildRaPayload', () => {
    const original = buildRaPayload(validValues({
      registrationMode: 'PRE_REGISTRATION',
      deviceMetadataJson: '{\n  "site": "north"\n}',
      serverKeygen: { enabled: true, type: 'ECDSA', spec: 'P-521' },
      managedCaIds: ['ca-2'],
    }));
    const ra: ApiRaItem = { ...original, creation_ts: '2026-01-01T00:00:00Z' };

    const { values, inlineProfile } = raFormValuesFromApi(ra);

    expect(inlineProfile).toBeNull();
    expect(buildRaPayload(values)).toEqual(original);
  });
});
