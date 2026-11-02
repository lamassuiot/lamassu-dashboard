import { describe, expect, it } from 'vitest';
import {
  isValidRelatedCertMaxAge,
  parseAllowedHosts,
  relatedCertificateFromApi,
  relatedCertificateToApi,
} from '@/lib/related-certificate';
import { buildInlineIssuanceProfile, mapIssuanceProfileToFormValues } from '@/lib/dms-form';
import { defaultFormValues } from '@/components/shared/SigningProfileForm';

describe('related certificate helpers', () => {
  it('parses hosts split by newlines, commas or spaces and drops duplicates', () => {
    expect(parseAllowedHosts('a.example.com\n b.example.com, a.example.com\n\n')).toEqual(['a.example.com', 'b.example.com']);
    expect(parseAllowedHosts('')).toEqual([]);
    expect(parseAllowedHosts(undefined)).toEqual([]);
  });

  it('accepts an empty or positive max age and rejects the rest', () => {
    expect(isValidRelatedCertMaxAge('')).toBe(true);
    expect(isValidRelatedCertMaxAge('5m')).toBe(true);
    expect(isValidRelatedCertMaxAge('0s')).toBe(false);
    expect(isValidRelatedCertMaxAge('soon')).toBe(false);
  });

  it('maps an omitted or null API value to the disabled defaults', () => {
    expect(relatedCertificateFromApi(undefined)).toEqual({ enabled: false, allowedHosts: '', maxAge: '' });
    expect(relatedCertificateFromApi({ enabled: false, allowed_hosts: null })).toEqual({ enabled: false, allowedHosts: '', maxAge: '' });
  });

  it('omits max_age when empty and always sends a hosts array', () => {
    expect(relatedCertificateToApi({ enabled: true, allowedHosts: '', maxAge: ' ' })).toEqual({ enabled: true, allowed_hosts: [] });
    expect(relatedCertificateToApi({ enabled: true, allowedHosts: 'a.example.com', maxAge: '10m' }))
      .toEqual({ enabled: true, allowed_hosts: ['a.example.com'], max_age: '10m' });
  });

  it('round-trips through the inline issuance profile mapping used by RAs', () => {
    const values = {
      ...defaultFormValues,
      profileName: 'bound',
      relatedCertificate: { enabled: true, allowedHosts: 'a.example.com\nb.example.com', maxAge: '2h' },
    };
    const profile = buildInlineIssuanceProfile(values);
    expect(profile.related_certificate).toEqual({ enabled: true, allowed_hosts: ['a.example.com', 'b.example.com'], max_age: '2h' });
    expect(mapIssuanceProfileToFormValues(profile).relatedCertificate).toEqual(values.relatedCertificate);
  });
});
