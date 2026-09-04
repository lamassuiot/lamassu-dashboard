import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ca-data', () => ({
  deleteCa: vi.fn(),
  deleteSigningProfile: vi.fn(),
  fetchAndProcessCAs: vi.fn(),
  fetchCaStatsSummary: vi.fn(),
  fetchSigningProfileById: vi.fn(),
  fetchSigningProfiles: vi.fn(),
  revokeCa: vi.fn(),
}));

vi.mock('@/lib/devices-api', () => ({
  decommissionDevice: vi.fn(),
  deleteDevice: vi.fn(),
  fetchDeviceStats: vi.fn(),
  fetchDeviceById: vi.fn(),
  fetchDevices: vi.fn(),
}));

vi.mock('@/lib/dms-api', () => ({
  deleteRa: vi.fn(),
  fetchDmsStats: vi.fn(),
  fetchRegistrationAuthorities: vi.fn(),
  fetchRaById: vi.fn(),
}));

vi.mock('@/lib/kms-data', () => ({
  deleteKmsKey: vi.fn(),
  fetchCryptoEngines: vi.fn(),
  fetchKmsKey: vi.fn(),
  fetchKmsKeys: vi.fn(),
}));

vi.mock('@/lib/issued-certificate-data', () => ({
  fetchIssuedCertificates: vi.fn(),
  updateCertificateStatus: vi.fn(),
}));

vi.mock('@/lib/va-api', () => ({
  checkOcspStatus: vi.fn(),
}));

import * as caData from '@/lib/ca-data';
import * as devicesApi from '@/lib/devices-api';
import * as dmsApi from '@/lib/dms-api';
import * as issuedCertificateData from '@/lib/issued-certificate-data';
import * as kmsData from '@/lib/kms-data';
import * as vaApi from '@/lib/va-api';
import type { CertificateData } from '@/types/certificate';
import {
  CHAT_TOOL_COUNT,
  createSyntheticToolCall,
  executeChatToolCall,
  getChatToolPlanningCatalog,
  isDestructiveTool,
} from './chat-tools';

const certificate: CertificateData = {
  id: 'AA:BB',
  fileName: 'device.pem',
  subject: 'CN=device.example.com',
  issuer: 'CN=Issuer CA',
  serialNumber: 'AA:BB',
  validFrom: '2026-01-01T00:00:00Z',
  validTo: '2027-01-01T00:00:00Z',
  pemData: '-----BEGIN CERTIFICATE-----\ntarget\n-----END CERTIFICATE-----',
  publicKeyAlgorithm: 'RSA (2048 bit)',
  fingerprintSha256: '11:22',
  issuerCaId: 'issuer-ca',
  apiStatus: 'ACTIVE',
  sans: ['device.example.com'],
  signatureAlgorithm: 'SHA256withRSA',
  ocspUrls: ['http://ocsp.example.com'],
  crlDistributionPoints: ['https://crl.example.com'],
  keyUsage: ['digitalSignature'],
  extendedKeyUsage: ['clientAuth'],
  rawApiData: {
    is_ca: false,
    type: 'MANAGED',
    engine_id: 'engine-1',
    metadata: { environment: 'test' },
  },
};

function execute(name: string, args: Record<string, unknown> = {}) {
  return executeChatToolCall(createSyntheticToolCall(name, args, `call-${name}`));
}

function readToolPayload(content: unknown) {
  return JSON.parse(String(content)) as {
    ok: boolean;
    result?: Record<string, any>;
    error?: string;
  };
}

describe('chat tool API contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes the complete tool catalog and marks every mutating tool as destructive', () => {
    const expectedTools = [
      'get_device_stats',
      'list_devices',
      'get_device',
      'list_registration_authorities',
      'get_registration_authority',
      'get_registration_authority_stats',
      'list_certificate_authorities',
      'get_certificate_authority_summary',
      'list_certificates',
      'get_certificate',
      'get_expiring_certificates',
      'check_certificate_status',
      'list_signing_profiles',
      'get_signing_profile',
      'list_crypto_engines',
      'list_kms_keys',
      'get_kms_key',
      'decommission_device',
      'delete_device',
      'delete_registration_authority',
      'delete_certificate_authority',
      'revoke_certificate',
      'revoke_certificate_authority',
      'delete_kms_key',
      'delete_signing_profile',
    ];
    const catalog = getChatToolPlanningCatalog();

    expect(CHAT_TOOL_COUNT).toBe(expectedTools.length);
    expectedTools.forEach((name) => expect(catalog).toContain(name));
    expect(expectedTools.filter(isDestructiveTool)).toEqual([
      'decommission_device',
      'delete_device',
      'delete_registration_authority',
      'delete_certificate_authority',
      'revoke_certificate',
      'revoke_certificate_authority',
      'delete_kms_key',
      'delete_signing_profile',
    ]);
  });

  it('uses the Device screen query fields and preserves the API response bookmark', async () => {
    vi.mocked(devicesApi.fetchDevices).mockResolvedValue({
      next: 'next-device',
      list: [{
        id: 'device-1',
        status: 'ACTIVE',
        dms_owner: 'ra-1',
        creation_timestamp: '2026-01-01T00:00:00Z',
        identity: null,
        tags: ['factory'],
      } as any],
    });

    const { toolMessage } = await execute('list_devices', {
      page_size: 25,
      sort_by: 'dms_owner',
      sort_mode: 'asc',
      bookmark: 'page-2',
      search_term: 'device',
      dms_owner: 'ra-1',
      tag: 'factory',
      status: 'ACTIVE',
    });

    const params = vi.mocked(devicesApi.fetchDevices).mock.calls[0][0];
    expect(params.get('page_size')).toBe('25');
    expect(params.get('sort_by')).toBe('dms_owner');
    expect(params.get('sort_mode')).toBe('asc');
    expect(params.get('bookmark')).toBe('page-2');
    expect(params.getAll('filter')).toEqual([
      'id[contains_ignorecase]device',
      'dms_owner[equal]ra-1',
      'tags[contains_ignorecase]factory',
      'status[equal]ACTIVE',
    ]);
    expect(readToolPayload(toolMessage.content).result?.next).toBe('next-device');
  });

  it('uses the paginated Registration Authorities request used by the UI', async () => {
    vi.mocked(dmsApi.fetchRegistrationAuthorities).mockResolvedValue({
      next: 'next-ra',
      list: [{ id: 'ra-1', name: 'Factory RA', creation_ts: '2026-01-01T00:00:00Z' } as any],
    });

    const { toolMessage } = await execute('list_registration_authorities', {
      page_size: 50,
      sort_by: 'creation_date',
      sort_mode: 'desc',
      search_term: 'factory',
      bookmark: 'ra-page-2',
    });

    const params = vi.mocked(dmsApi.fetchRegistrationAuthorities).mock.calls[0][0];
    expect(params?.get('page_size')).toBe('50');
    expect(params?.get('sort_by')).toBe('creation_date');
    expect(params?.get('sort_mode')).toBe('desc');
    expect(params?.get('filter')).toBe('name[contains_ignorecase]factory');
    expect(params?.get('bookmark')).toBe('ra-page-2');
    expect(readToolPayload(toolMessage.content).result).toMatchObject({
      next: 'next-ra',
      registration_authorities: [{ id: 'ra-1', name: 'Factory RA' }],
    });
  });

  it('lists certificates with the same filters and CA-scoped URL inputs as the UI', async () => {
    vi.mocked(issuedCertificateData.fetchIssuedCertificates).mockResolvedValue({
      certificates: [certificate],
      nextToken: 'next-cert',
    });

    const { toolMessage } = await execute('list_certificates', {
      page_size: 25,
      sort_by: 'valid_to',
      sort_mode: 'asc',
      search_term: 'device',
      search_field: 'commonName',
      status: 'ACTIVE',
      ca_id: 'issuer-ca',
      is_ca: 'false',
      bookmark: 'cert-page-2',
    });

    const request = vi.mocked(issuedCertificateData.fetchIssuedCertificates).mock.calls[0][0];
    const params = new URLSearchParams(request.apiQueryString);
    expect(request.forCaId).toBe('issuer-ca');
    expect(params.get('page_size')).toBe('25');
    expect(params.get('sort_by')).toBe('valid_to');
    expect(params.get('sort_mode')).toBe('asc');
    expect(params.get('bookmark')).toBe('cert-page-2');
    expect(params.getAll('filter')).toEqual([
      'status[equal]ACTIVE',
      'subject.common_name[contains_ignorecase]device',
      'is_ca[equal]false',
    ]);
    expect(readToolPayload(toolMessage.content).result).toMatchObject({
      next: 'next-cert',
      certificates: [{
        serial_number: 'AA:BB',
        issuer_ca_id: 'issuer-ca',
        status: 'ACTIVE',
        metadata: { environment: 'test' },
      }],
    });
  });

  it('loads certificate details with the exact serial-number filter used by the details screen', async () => {
    vi.mocked(issuedCertificateData.fetchIssuedCertificates).mockResolvedValue({ certificates: [certificate], nextToken: null });

    const { toolMessage } = await execute('get_certificate', { serial_number: 'AA:BB' });

    expect(issuedCertificateData.fetchIssuedCertificates).toHaveBeenCalledWith({
      apiQueryString: 'filter=serial_number[equal_ignorecase]AABB&page_size=1',
    });
    expect(readToolPayload(toolMessage.content).result).toMatchObject({
      serial_number: 'AA:BB',
      fingerprint_sha256: '11:22',
      ocsp_urls: ['http://ocsp.example.com'],
    });
  });

  it('queries active certificates by the UI valid_to before filter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(issuedCertificateData.fetchIssuedCertificates).mockResolvedValue({ certificates: [certificate], nextToken: null });

    try {
      const { toolMessage } = await execute('get_expiring_certificates', { days: 30, page_size: 10, ca_id: 'issuer-ca' });
      const request = vi.mocked(issuedCertificateData.fetchIssuedCertificates).mock.calls[0][0];
      const params = new URLSearchParams(request.apiQueryString);

      expect(request.forCaId).toBe('issuer-ca');
      expect(params.get('sort_by')).toBe('valid_to');
      expect(params.get('sort_mode')).toBe('asc');
      expect(params.getAll('filter')).toEqual([
        'status[equal]ACTIVE',
        expect.stringMatching(/^valid_to\[before\]2026-01-31T\d{2}:00:00$/),
      ]);
      expect(readToolPayload(toolMessage.content).result).toMatchObject({
        within_days: 30,
        expires_before: '2026-01-31T00:00:00.000Z',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs OCSP with the same certificate, issuer and HTTPS upgrade as the UI modal', async () => {
    vi.mocked(issuedCertificateData.fetchIssuedCertificates).mockResolvedValue({ certificates: [certificate], nextToken: null });
    vi.mocked(caData.fetchAndProcessCAs).mockResolvedValue([{
      id: 'issuer-ca',
      name: 'Issuer CA',
      expires: '2030-01-01T00:00:00Z',
      issuer: 'Self-signed',
      serialNumber: '01',
      status: 'active',
      keyAlgorithm: 'RSA',
      pemData: '-----BEGIN CERTIFICATE-----\nissuer\n-----END CERTIFICATE-----',
    }]);
    vi.mocked(vaApi.checkOcspStatus).mockResolvedValue({
      status: 'good',
      statusText: 'Good',
      producedAt: '2026-01-01T00:00:00Z',
      requestDer: new ArrayBuffer(2),
      responseDer: new ArrayBuffer(2),
    });

    const { toolMessage } = await execute('check_certificate_status', { serial_number: 'AA:BB' });

    expect(vaApi.checkOcspStatus).toHaveBeenCalledWith(
      certificate.pemData,
      expect.stringContaining('issuer'),
      'https://ocsp.example.com',
    );
    expect(readToolPayload(toolMessage.content).result).toEqual({
      serial_number: 'AA:BB',
      stored_status: 'ACTIVE',
      issuer_ca_id: 'issuer-ca',
      ocsp_url: 'https://ocsp.example.com',
      status: 'good',
      status_text: 'Good',
      produced_at: '2026-01-01T00:00:00Z',
      this_update: null,
      next_update: null,
      revocation_reason: null,
      revocation_time: null,
      responder_id: null,
      error_details: null,
    });
  });

  it('uses the exact UI revocation helpers and accepted reason values', async () => {
    const certificateResult = await execute('revoke_certificate', {
      serial_number: 'AA:BB',
      reason: 'KeyCompromise',
    });
    const caResult = await execute('revoke_certificate_authority', {
      caId: 'ca-1',
      reason: 'CACompromise',
    });

    expect(issuedCertificateData.updateCertificateStatus).toHaveBeenCalledWith({
      serialNumber: 'AA:BB',
      status: 'REVOKED',
      reason: 'KeyCompromise',
    });
    expect(caData.revokeCa).toHaveBeenCalledWith('ca-1', 'CACompromise');
    expect(certificateResult.invocation.destructive).toBe(true);
    expect(caResult.invocation.destructive).toBe(true);

    const invalid = await execute('revoke_certificate', {
      serial_number: 'AA:BB',
      reason: 'not-a-real-reason',
    });
    expect(invalid.invocation.status).toBe('error');
    expect(invalid.invocation.error).toContain('Allowed values');
  });

  it('delegates the remaining tools to the same shared clients used by their UI screens', async () => {
    vi.mocked(devicesApi.fetchDeviceStats).mockResolvedValue({ total: 1 } as any);
    vi.mocked(devicesApi.fetchDeviceById).mockResolvedValue({ id: 'device-1' } as any);
    vi.mocked(dmsApi.fetchRaById).mockResolvedValue({ id: 'ra-1' } as any);
    vi.mocked(dmsApi.fetchDmsStats).mockResolvedValue({ total: 1 });
    vi.mocked(caData.fetchAndProcessCAs).mockResolvedValue([]);
    vi.mocked(caData.fetchCaStatsSummary).mockResolvedValue({ total: 1 } as any);
    vi.mocked(caData.fetchSigningProfiles).mockResolvedValue({ next: null, list: [] });
    vi.mocked(caData.fetchSigningProfileById).mockResolvedValue({ id: 'profile-1' } as any);
    vi.mocked(kmsData.fetchCryptoEngines).mockResolvedValue([]);
    vi.mocked(kmsData.fetchKmsKeys).mockResolvedValue({ next: null, list: [] });
    vi.mocked(kmsData.fetchKmsKey).mockResolvedValue({ key_id: 'key-1' } as any);

    await execute('get_device_stats');
    await execute('get_device', { deviceId: 'device-1' });
    await execute('get_registration_authority', { raId: 'ra-1' });
    await execute('get_registration_authority_stats');
    await execute('list_certificate_authorities', { limit: 20 });
    await execute('get_certificate_authority_summary');
    await execute('list_signing_profiles', { page_size: 20 });
    await execute('get_signing_profile', { profileId: 'profile-1' });
    await execute('list_crypto_engines');
    await execute('list_kms_keys', { page_size: 20 });
    await execute('get_kms_key', { keyId: 'key-1' });
    await execute('decommission_device', { deviceId: 'device-1' });
    await execute('delete_device', { deviceId: 'device-1' });
    await execute('delete_registration_authority', { raId: 'ra-1' });
    await execute('delete_certificate_authority', { caId: 'ca-1' });
    await execute('delete_kms_key', { keyId: 'key-1' });
    await execute('delete_signing_profile', { profileId: 'profile-1' });

    expect(devicesApi.fetchDeviceStats).toHaveBeenCalledOnce();
    expect(devicesApi.fetchDeviceById).toHaveBeenCalledWith('device-1');
    expect(dmsApi.fetchRaById).toHaveBeenCalledWith('ra-1');
    expect(dmsApi.fetchDmsStats).toHaveBeenCalledOnce();
    expect(caData.fetchAndProcessCAs).toHaveBeenCalledWith('page_size=20');
    expect(caData.fetchCaStatsSummary).toHaveBeenCalledOnce();
    expect(caData.fetchSigningProfileById).toHaveBeenCalledWith('profile-1');
    expect(kmsData.fetchCryptoEngines).toHaveBeenCalledOnce();
    expect(kmsData.fetchKmsKey).toHaveBeenCalledWith('key-1');
    expect(devicesApi.decommissionDevice).toHaveBeenCalledWith('device-1');
    expect(devicesApi.deleteDevice).toHaveBeenCalledWith('device-1');
    expect(dmsApi.deleteRa).toHaveBeenCalledWith('ra-1');
    expect(caData.deleteCa).toHaveBeenCalledWith('ca-1');
    expect(kmsData.deleteKmsKey).toHaveBeenCalledWith('key-1');
    expect(caData.deleteSigningProfile).toHaveBeenCalledWith('profile-1');
  });
});
