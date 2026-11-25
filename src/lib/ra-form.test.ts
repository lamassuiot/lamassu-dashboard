import { describe, expect, it } from 'vitest';

import type { ApiRaEstSettings, ApiRaItem } from '@/lib/dms-api';
import {
  authModeFor,
  buildRaPayload,
  createDefaultRaFormValues,
  enrollmentCaSharing,
  isIssueVisible,
  raFormValuesFromApi,
  slugifyRaId,
  validateRaForm,
  type RaFormValues,
} from './ra-form';

function withValidationCas(settings: ApiRaEstSettings, validationCas: string[]): ApiRaEstSettings {
  return { ...settings, client_certificate_settings: { ...settings.client_certificate_settings!, validation_cas: validationCas } };
}

function validValues(overrides: Partial<RaFormValues> = {}): RaFormValues {
  const defaults = createDefaultRaFormValues(200);
  return {
    ...defaults,
    name: 'Factory RA',
    id: 'factory-ra',
    enrollmentCaId: 'ca-1',
    enrollmentAuth: withValidationCas(defaults.enrollmentAuth, ['bootstrap-ca']),
    ...overrides,
  };
}

const context = { isEditMode: false, enrollmentCaHasDefaultProfile: true };

describe('authModeFor', () => {
  it('maps the client certificate and webhook checks to every auth mode', () => {
    expect(authModeFor(true, true)).toBe('CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK');
    expect(authModeFor(true, false)).toBe('CLIENT_CERTIFICATE');
    expect(authModeFor(false, true)).toBe('EXTERNAL_WEBHOOK');
    expect(authModeFor(false, false)).toBe('NO_AUTH');
  });
});

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

  it('does not require re-enrollment validation CAs because the Enrollment CA is always trusted', () => {
    const issues = validateRaForm(validValues(), context);
    expect(validValues().reenrollmentAuth.client_certificate_settings?.validation_cas).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('still requires enrollment validation CAs for client-certificate authentication', () => {
    const issues = validateRaForm(validValues({ enrollmentAuth: createDefaultRaFormValues(0).enrollmentAuth }), context);
    expect(issues).toEqual([expect.objectContaining({ section: 'enrollment', field: 'enrollmentAuth', kind: 'required' })]);
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

  it('sends the authz principal switch, off by default', () => {
    expect(buildRaPayload(validValues()).settings.authz_principal_settings).toEqual({ enabled: false, policy_ids: [], subject_attribute_mappings: {} });
    expect(buildRaPayload(validValues({ createAuthzPrincipal: true })).settings.authz_principal_settings).toEqual({ enabled: true, policy_ids: [], subject_attribute_mappings: {} });
  });

  it('sends the policies and subject attributes of the authz principal', () => {
    const payload = buildRaPayload(validValues({
      createAuthzPrincipal: true,
      authzPolicyIds: ['device-sbi-client'],
      authzAttributes: [{ name: ' client_id ', source: 'x509.subject.cn' }],
    }));

    expect(payload.settings.authz_principal_settings).toEqual({
      enabled: true,
      policy_ids: ['device-sbi-client'],
      subject_attribute_mappings: { client_id: 'x509.subject.cn' },
    });
  });
});

describe('raFormValuesFromApi', () => {
  it('round-trips through buildRaPayload', () => {
    const original = buildRaPayload(validValues({
      registrationMode: 'PRE_REGISTRATION',
      deviceMetadataJson: '{\n  "site": "north"\n}',
      serverKeygen: { enabled: true, type: 'ECDSA', spec: 'P-521' },
      managedCaIds: ['ca-2'],
      reenrollmentAuth: withValidationCas(createDefaultRaFormValues(0).reenrollmentAuth, ['old-ca']),
      createAuthzPrincipal: true,
      authzPolicyIds: ['policy-a', 'policy-b'],
      authzAttributes: [{ name: 'client_id', source: 'x509.serial_number' }],
    }));
    const ra: ApiRaItem = { ...original, creation_ts: '2026-01-01T00:00:00Z' };

    const { values, inlineProfile } = raFormValuesFromApi(ra);

    expect(inlineProfile).toBeNull();
    expect(buildRaPayload(values)).toEqual(original);
  });

  it('reads an RA stored before the authz principal switch as off', () => {
    const { authz_principal_settings: _, ...settings } = buildRaPayload(validValues({ createAuthzPrincipal: true })).settings;
    const ra: ApiRaItem = { ...buildRaPayload(validValues()), settings, creation_ts: '2026-01-01T00:00:00Z' };

    expect(raFormValuesFromApi(ra).values.createAuthzPrincipal).toBe(false);
    expect(raFormValuesFromApi(ra).values.authzPolicyIds).toEqual([]);
    expect(raFormValuesFromApi(ra).values.authzAttributes).toEqual([]);
  });
});

describe('validateRaForm authz principal', () => {
  // The attributes are sent and stored with the switch off too, so both states are checked alike.
  describe.each([true, false])('with the principal switch on: %s', createAuthzPrincipal => {
    const attributeIssues = (...names: string[]) => validateRaForm(
      validValues({ createAuthzPrincipal, authzAttributes: names.map(name => ({ name, source: 'x509.subject.cn' })) }),
      context,
    ).filter(issue => issue.field === 'authzAttributes');
    const issue = (kind: 'required' | 'invalid', message: RegExp) =>
      expect.objectContaining({ section: 'issuance', severity: 'error', kind, message: expect.stringMatching(message) });

    it('requires a name, shown once the attributes are touched or the form submitted', () => {
      expect(attributeIssues('client_id', ' ')).toEqual([issue('required', /needs a name/)]);
    });

    it('rejects names repeated after trimming', () => {
      expect(attributeIssues('client_id', 'client_id ')).toEqual([issue('invalid', /unique/)]);
    });

    it('rejects names containing whitespace', () => {
      expect(attributeIssues('client id')).toEqual([issue('invalid', /spaces/)]);
    });

    it('reports an invalid name even while another one is still empty', () => {
      expect(attributeIssues('client id', '').map(issue => issue.kind)).toEqual(['required', 'invalid']);
    });

    it('accepts unique names without inner whitespace', () => {
      expect(attributeIssues(' client_id ', 'device_id')).toEqual([]);
    });
  });
});

describe('enrollmentCaSharing', () => {
  function ra(id: string, caId: string, principal?: { enabled: boolean; policy_ids?: string[] }): ApiRaItem {
    const base = buildRaPayload(validValues({ id, name: `RA ${id}`, enrollmentCaId: caId }));
    return {
      ...base,
      settings: { ...base.settings, authz_principal_settings: principal },
      creation_ts: '2026-01-01T00:00:00Z',
    };
  }

  const ras = [
    ra('self', 'ca-x', { enabled: true, policy_ids: ['p-self'] }),
    ra('with-policies', 'ca-x', { enabled: true, policy_ids: ['p1', 'p2'] }),
    ra('off', 'ca-x', { enabled: false, policy_ids: ['p3'] }),
    ra('no-policies', 'ca-x', { enabled: true, policy_ids: [] }),
    ra('legacy', 'ca-x'),
    ra('elsewhere', 'ca-y', { enabled: true, policy_ids: ['p4'] }),
  ];

  it('lists the other RAs on the CA whose principal grants policies', () => {
    const sharing = enrollmentCaSharing(ras, 'ca-x', 'self');
    expect(sharing.principalsWithPolicies).toEqual([{ id: 'with-policies', name: 'RA with-policies', policyIds: ['p1', 'p2'] }]);
  });

  it('lists every other RA on the CA, whatever its principal', () => {
    const sharing = enrollmentCaSharing(ras, 'ca-x', 'self');
    expect(sharing.otherRas.map(other => other.id)).toEqual(['with-policies', 'off', 'no-policies', 'legacy']);
  });

  it('shares nothing without a CA or with an unused one', () => {
    expect(enrollmentCaSharing(ras, null, 'self')).toEqual({ principalsWithPolicies: [], otherRas: [] });
    expect(enrollmentCaSharing(ras, 'ca-z', 'self')).toEqual({ principalsWithPolicies: [], otherRas: [] });
  });

  it('counts the RA being created, whose id is still empty, against every RA', () => {
    expect(enrollmentCaSharing(ras, 'ca-y', '').otherRas.map(other => other.id)).toEqual(['elsewhere']);
  });
});
