import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CmpEnrollModal } from './CmpEnrollModal';

const {
  fetchAndProcessCAsMock,
  fetchCryptoEnginesMock,
  fetchIssuedCertificateMock,
  fetchIssuedCertificatesMock,
} = vi.hoisted(() => ({
  fetchAndProcessCAsMock: vi.fn(),
  fetchCryptoEnginesMock: vi.fn(),
  fetchIssuedCertificateMock: vi.fn(),
  fetchIssuedCertificatesMock: vi.fn(),
}));

vi.mock('@/lib/ca-data', () => ({
  fetchAndProcessCAs: fetchAndProcessCAsMock,
  findCaById: vi.fn(),
  signCertificate: vi.fn(),
}));

vi.mock('@/lib/kms-data', () => ({
  fetchCryptoEngines: fetchCryptoEnginesMock,
}));

vi.mock('@/lib/issued-certificate-data', () => ({
  fetchIssuedCertificate: fetchIssuedCertificateMock,
  fetchIssuedCertificates: fetchIssuedCertificatesMock,
}));

vi.mock('@/lib/devices-api', () => ({
  fetchDevices: vi.fn(),
}));

vi.mock('@/lib/api-domains', () => ({
  get_CMP_API_BASE_URL: () => 'http://localhost:8080/api/dmsmanager/.well-known/cmp',
  get_CA_API_BASE_URL: () => 'http://localhost:8080/api/ca',
}));

vi.mock('@/lib-crypto', () => ({
  arrayBufferToBase64: vi.fn(),
  buildSelfSignedCsr: vi.fn(),
  formatAsPem: vi.fn(),
  initPkijsEngine: vi.fn(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/lib/toast', () => ({
  sileo: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../CaVisualizerCard', () => ({
  CaVisualizerCard: () => null,
}));

vi.mock('./CodeBlock', () => ({
  CodeBlock: ({ content }: { content: string }) => <pre data-testid="code-block">{content}</pre>,
}));

const DEVICE_ID = 'dc6bd1f1-c425-44ad-a8ad-06ee960ad345';

const ra = {
  id: 'iot',
  name: 'IoT',
  settings: {
    protocol: 'CMP',
    cmp_settings: {
      enrollment_settings: {
        enrollment_ca: 'enroll-ca',
        protection_certificate: 'ABC123',
        auth_mode: 'CLIENT_CERTIFICATE' as const,
        accept_implicit: false,
        enforce_popo: true,
        client_certificate_settings: { validation_cas: [] },
        cr: {
          enabled: true,
          proof_of_possession: { allowed_methods: ['signature' as const] },
        },
        p10cr: { enabled: false },
        rr: {
          enabled: true,
          allowed_reasons: ['unspecified' as const],
        },
      },
    },
  },
};

describe('CmpEnrollModal flows', () => {
  beforeEach(() => {
    fetchAndProcessCAsMock.mockReset().mockResolvedValue([]);
    fetchCryptoEnginesMock.mockReset().mockResolvedValue([]);
    fetchIssuedCertificateMock.mockReset().mockResolvedValue({ issuerCaId: 'enroll-ca' });
    fetchIssuedCertificatesMock.mockReset().mockResolvedValue({ certificates: [] });
  });

  it('skips bootstrap and protects CR with the existing credential', async () => {
    render(
      <CmpEnrollModal
        isOpen
        onOpenChange={() => {}}
        ra={ra}
        initialDeviceId={DEVICE_ID}
        presentation="inline"
      />,
    );

    await waitFor(() => expect(fetchAndProcessCAsMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Loading CAs…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Certification Request \(CR\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect((await screen.findAllByText('Flow variant')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Bootstrap')).not.toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent ===
      'Configure key generation, confirmation, and proof of possession for Certification Request (CR).',
    )).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    const crCommand = (await screen.findAllByTestId('code-block'))
      .map((element) => element.textContent ?? '')
      .find((content) => content.includes('-cmd cr'));

    expect(crCommand).toBeDefined();
    expect(crCommand).toContain(
      `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out new-${DEVICE_ID}.key`,
    );
    expect(crCommand).toContain('-server http://localhost:8080');
    expect(crCommand).toContain('-path /api/dmsmanager/.well-known/cmp/p/iot');
    expect(crCommand).toContain(`-cert ${DEVICE_ID}.crt -key ${DEVICE_ID}.key`);
    expect(crCommand).toContain(`-extracerts ${DEVICE_ID}.crt`);
    expect(crCommand).toContain(`-newkey new-${DEVICE_ID}.key`);
    expect(crCommand).toContain(`-subject "/CN=${DEVICE_ID}"`);
    expect(crCommand).toContain('-trusted enrollca.pem');
    expect(crCommand).toContain('-srvcert srvcert.pem');
    expect(crCommand).toContain(`-certout new-${DEVICE_ID}.crt`);
    expect(crCommand).not.toContain('bootstrap.crt');
    expect(crCommand).not.toContain('bootstrap.key');

    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect((await screen.findAllByText('Flow variant')).length).toBeGreaterThan(0);
  });

  it('prefixes the default bootstrap common name with bootstrap', async () => {
    render(
      <CmpEnrollModal
        isOpen
        onOpenChange={() => {}}
        ra={ra}
        initialDeviceId={DEVICE_ID}
        presentation="inline"
      />,
    );

    await waitFor(() => expect(fetchAndProcessCAsMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Loading CAs…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByLabelText('Bootstrap Common Name (CN)')).toHaveValue(
      `bootstrap.${DEVICE_ID}`,
    );
  });

  it('gates the RR warning on rr.enabled instead of p10cr.enabled', async () => {
    render(
      <CmpEnrollModal
        isOpen
        onOpenChange={() => {}}
        ra={ra}
        initialDeviceId={DEVICE_ID}
        presentation="inline"
      />,
    );

    await waitFor(() => expect(fetchAndProcessCAsMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Loading CAs…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Revocation Request \(RR\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Issue Bootstrap Cert' }));

    expect((await screen.findAllByTestId('code-block'))
      .some((element) => element.textContent?.includes('-cmd rr'))).toBe(true);
    expect(screen.queryByText('Revocation Request (RR) is disabled on this DMS')).not.toBeInTheDocument();
  });
});
