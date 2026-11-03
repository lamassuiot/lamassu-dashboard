import { describe, expect, it } from 'vitest';
import golden from '@/lib-crypto/related-cert-request.golden.json';
import { bytesToHex } from '@/lib-crypto';
import {
  DEFAULT_RELATED_CERT_MAX_AGE_SECONDS,
  createEmptyRelatedCertRequestInput,
  getRelatedCertMaxAgeSeconds,
  resolveRelatedCertRequest,
  splitLocationInfo,
  tryParseRelatedCertificate,
  type RelatedCertRequestInput,
} from '@/lib/related-cert-request';

const v = golden[0];

const base = (overrides: Partial<RelatedCertRequestInput> = {}): RelatedCertRequestInput => ({
  ...createEmptyRelatedCertRequestInput(),
  requestTime: v.requestTime,
  locationText: v.locationInfo.join('\n'),
  signature: v.signatureHex,
  ...overrides,
});

describe('resolveRelatedCertRequest', () => {
  it('reports every missing field on an empty form', () => {
    const { errors, params, dataToSign } = resolveRelatedCertRequest(createEmptyRelatedCertRequestInput());
    expect(params).toBeUndefined();
    expect(dataToSign).toBeUndefined();
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('issuer is required'),
      expect.stringContaining('serial number is required'),
      expect.stringContaining('location'),
      expect.stringContaining('signature is required'),
    ]));
  });

  it('uses the pasted certificate for the exact issuer and serial and yields the Go signed data', () => {
    const { params, dataToSign, errors, warnings } = resolveRelatedCertRequest(base({ certPem: v.relatedCertPem }));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(bytesToHex(dataToSign!)).toBe(v.tbsHex);
    expect(bytesToHex(params!.issuerDer)).toBe(v.issuerDerHex);
    expect(params!.serialHex).toBe(v.serialHex);
  });

  it('accepts typed issuer fields, serial and DER and matches the same bytes', () => {
    const typed = resolveRelatedCertRequest(base({
      issuerFields: { country: 'ES', stateProvince: 'Gipuzkoa', locality: 'Arrasate', organization: 'Ikerlan', organizationalUnit: 'PKI', commonName: 'Related CA' },
      serialHex: '0x07',
    }));
    expect(typed.errors).toEqual([]);
    expect(bytesToHex(typed.dataToSign!)).toBe(v.tbsHex);

    const der = resolveRelatedCertRequest(base({ issuerMode: 'der', issuerDer: v.issuerDerHex, serialHex: '7' }));
    expect(der.errors).toEqual([]);
    expect(bytesToHex(der.dataToSign!)).toBe(v.tbsHex);
  });

  it('ignores typed issuer and serial once a valid certificate is pasted', () => {
    const { params, warnings, errors } = resolveRelatedCertRequest(base({
      certPem: v.relatedCertPem,
      issuerFields: { commonName: 'Other CA' },
      serialHex: '08',
    }));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(bytesToHex(params!.issuerDer)).toBe(v.issuerDerHex);
    expect(params!.serialHex).toBe(v.serialHex);
  });

  it('falls back to the typed values and reports an unparseable certificate', () => {
    const { errors } = resolveRelatedCertRequest(base({ certPem: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----' }));
    expect(errors.join('\n')).toContain('Related certificate:');
    expect(tryParseRelatedCertificate('')).toBeNull();
    expect(tryParseRelatedCertificate('garbage')).toBeNull();
    expect(tryParseRelatedCertificate(v.relatedCertPem)?.serialHex).toBe(v.serialHex);
  });

  it('flags bad locations, serial and signature input', () => {
    const { errors } = resolveRelatedCertRequest(base({
      issuerFields: { commonName: 'CA' },
      locationText: 'ftp://example.com/x\nhttps://exämple.com',
      serialHex: 'zz',
      signature: '!!',
    }));
    expect(errors.join('\n')).toContain('data: or http(s)');
    expect(errors.join('\n')).toContain('printable ASCII');
    expect(errors.join('\n')).toContain('hexadecimal');
    expect(errors.join('\n')).toContain('signature');
  });
});

describe('related certificate helpers', () => {
  it('splits one location per line', () => {
    expect(splitLocationInfo(' a \n\n b\r\n')).toEqual(['a', 'b']);
  });

  it('reads the profile max age and falls back to five minutes', () => {
    expect(getRelatedCertMaxAgeSeconds(undefined)).toBe(DEFAULT_RELATED_CERT_MAX_AGE_SECONDS);
    expect(getRelatedCertMaxAgeSeconds({ related_certificate: { enabled: true } })).toBe(300);
    expect(getRelatedCertMaxAgeSeconds({ related_certificate: { enabled: true, max_age: '2h' } })).toBe(7200);
  });
});
