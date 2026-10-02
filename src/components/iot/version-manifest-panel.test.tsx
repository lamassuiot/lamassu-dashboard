import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VersionManifestPanel } from './version-manifest-panel';
import type { VersionSignature } from '@/lib/iot-api';

// What these cover:
//  - an UNSIGNED manifest is still shown in full. The point of the panel is what a version delivers,
//    and hawkbit mode commonly has nothing that signed it.
//  - a stale manifest is not presented as signed. A signature that no longer covers the set is worse
//    than none if it reads as valid.
//  - hawkbit's per-module composition is rendered per module, native's flat list as one table.
//  - the raw section is the exact signed bytes, not a re-formatted copy the signature does not cover.

const fetchVersionSignature = vi.fn();
vi.mock('@/lib/iot-api', () => ({ fetchVersionSignature: (...args: unknown[]) => fetchVersionSignature(...args) }));
vi.mock('@/lib-crypto/cert-parser', () => ({
  parseCertificatePemDetails: vi.fn(async () => ({ subject: 'CN=ota-signer' })),
}));

const hawkbitManifest = JSON.stringify({
  distribution_set: 'gw', group: 'g1', version: '1.2.0', packaging: 'non-swu', type: 'rawfile',
  created_at: '2026-09-23T10:00:00Z',
  artifacts: [],
  deliverable: { kind: 'software-modules' },
  modules: [
    { name: 'gw', type: 'os', version: '1.2.0', signature_alg: 'ECDSA_SHA_256',
      artifacts: [{ name: 'os.img', version: '1.2.0', filename: 'os.img', sha256: 'a'.repeat(64), size: 2048 }] },
    { name: 'agent', type: 'application', version: '0.9.0', encryption: 'shared', encryption_alg: 'AES-256-GCM',
      artifacts: [{ name: 'agent.bin.enc', version: '0.9.0', filename: 'agent.bin.enc', sha256: 'b'.repeat(64), size: 10 }] },
  ],
});

const nativeManifest = JSON.stringify({
  distribution_set: 'fw', group: 'g1', version: '3.0.0', packaging: 'swu', type: 'firmware',
  created_at: '2026-09-23T10:00:00Z',
  artifacts: [{ name: 'kernel', version: '6.1.0', filename: 'zImage', sha256: 'c'.repeat(64), size: 4096 }],
  deliverable: { kind: 'swu', filename: 'fw.swu', sha256: 'd'.repeat(64), size: 8192 },
});

function renderPanel(backend: string, sig: Partial<VersionSignature>) {
  fetchVersionSignature.mockResolvedValue({ pack: 'x', version: '1.2.0', signature: '', ...sig });
  return render(
    <VersionManifestPanel
      groupId="g1"
      packName="gw"
      versions={['1.2.0', '1.1.0']}
      currentVersion="1.2.0"
      version="1.2.0"
      onVersionChange={() => {}}
      backend={backend}
    />,
  );
}

describe('VersionManifestPanel', () => {
  // Braced: a function returned from beforeEach is run as teardown, and mockReset returns the mock.
  beforeEach(() => {
    fetchVersionSignature.mockReset();
  });

  it('shows an unsigned hawkbit set in full, per module, and says how it gets signed', async () => {
    renderPanel('hawkbit', { manifest: hawkbitManifest });
    expect(await screen.findByText('Unsigned')).toBeTruthy();
    expect(screen.getByText(/signed when one of its software modules is built with a signing key/)).toBeTruthy();
    expect(screen.getByText('os.img')).toBeTruthy();
    expect(screen.getByText('agent.bin.enc')).toBeTruthy();
    expect(screen.getByText('Encrypted · AES-256-GCM')).toBeTruthy();
    expect(screen.getByText('Module signed')).toBeTruthy();
    expect(screen.queryByText('Signer')).toBeNull();
  });

  it('shows signer, validity and the device-visible digest when signed', async () => {
    renderPanel('hawkbit', {
      manifest: hawkbitManifest,
      signature: 'MIIB...',
      algorithm: 'ECDSA_SHA_256',
      certificate: '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----',
      signed_at: '2026-09-23T10:00:00Z',
      expires_at: '2031-09-22T10:00:00Z',
    });
    expect(await screen.findByText(/A device can verify this PKCS7\/CMS signature/)).toBeTruthy();
    expect(await screen.findByText('CN=ota-signer')).toBeTruthy();
    expect(screen.getByText('Expires')).toBeTruthy();
    expect(screen.getByText('ota_manifest_sha256')).toBeTruthy();
  });

  it('never presents a stale signature as valid', async () => {
    renderPanel('hawkbit', { manifest: hawkbitManifest, stale: true });
    expect(await screen.findByText('Signature outdated')).toBeTruthy();
    expect(screen.queryByText('Signed')).toBeNull();
  });

  it('renders a native manifest as one artifact list plus its deliverable', async () => {
    renderPanel('native', { manifest: nativeManifest });
    expect(await screen.findByText('Unsigned')).toBeTruthy();
    expect(screen.getByText(/built without a signing key/)).toBeTruthy();
    expect(screen.getByText('zImage')).toBeTruthy();
    expect(screen.getByText('Deliverable')).toBeTruthy();
    expect(screen.queryByText('ota_manifest_sha256')).toBeNull();
  });

  it('keeps the raw section byte-for-byte identical to what was signed', async () => {
    const { container } = renderPanel('native', { manifest: nativeManifest, signature: 'sig' });
    await screen.findByText('Signed bytes');
    expect(container.querySelector('pre')?.textContent).toBe(nativeManifest);
  });

  it('explains a version that has no manifest recorded', async () => {
    fetchVersionSignature.mockRejectedValue(new Error('version 1.2.0 of pack "gw" has no recorded manifest/signature'));
    render(
      <VersionManifestPanel groupId="g1" packName="gw" versions={['1.2.0']} currentVersion="1.2.0"
        version="1.2.0" onVersionChange={() => {}} backend="native" />,
    );
    expect(await screen.findByText('No manifest for v1.2.0')).toBeTruthy();
  });
});
