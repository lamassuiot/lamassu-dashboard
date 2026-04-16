import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CertificateSelectorModal } from './CertificateSelectorModal';
import type { CA } from '@/lib/ca-data';

const { fetchIssuedCertificatesMock } = vi.hoisted(() => ({
  fetchIssuedCertificatesMock: vi.fn(),
}));

vi.mock('@/lib/issued-certificate-data', () => ({
  fetchIssuedCertificates: fetchIssuedCertificatesMock,
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock('../ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/components/shared/filters/CertificateFilterBar', () => ({
  CertificateFilterBar: () => <div>filter bar</div>,
}));

vi.mock('@/components/shared/CertificatePaginationControls', () => ({
  CertificatePaginationControls: () => <div>pagination controls</div>,
}));

vi.mock('./CertificateTable', () => ({
  CertificateTable: () => <div>certificate table</div>,
}));

function buildCa(id: string, name: string): CA {
  return {
    id,
    name,
    expires: '2026-01-01T00:00:00Z',
    issuer: 'Self-signed',
    serialNumber: `${id}-serial`,
    status: 'active',
    keyAlgorithm: 'RSA',
  };
}

const EMPTY_REQUIRED_KEY_USAGES = [] as const;

function buildCertificate(subject: string, isCa: boolean) {
  return {
    id: `${subject}-id`,
    fileName: `${subject}.pem`,
    subject,
    issuer: 'CN=Issuer',
    serialNumber: `${subject}-serial`,
    validFrom: '2025-01-01T00:00:00Z',
    validTo: '2027-01-01T00:00:00Z',
    pemData: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
    rawApiData: { is_ca: isCa },
  };
}

describe('CertificateSelectorModal', () => {
  beforeEach(() => {
    fetchIssuedCertificatesMock.mockReset();
    fetchIssuedCertificatesMock.mockResolvedValue({
      certificates: [],
      nextToken: null,
    });
  });

  it('passes the selected CA id to the certificate fetch when restricted to CAs', async () => {
    render(
      <CertificateSelectorModal
        isOpen
        onOpenChange={() => {}}
        title="Select Certificate"
        description="Choose a certificate"
        onCertificateSelected={() => {}}
        limitToCAs={[buildCa('ca-1', 'CA 1')]}
        requiredKeyUsages={EMPTY_REQUIRED_KEY_USAGES}
      />
    );

    await waitFor(() => {
      expect(fetchIssuedCertificatesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          forCaId: 'ca-1',
        })
      );
    });
  });

  it('does not pass a CA id when there is no CA restriction', async () => {
    render(
      <CertificateSelectorModal
        isOpen
        onOpenChange={() => {}}
        title="Select Certificate"
        description="Choose a certificate"
        onCertificateSelected={() => {}}
        requiredKeyUsages={EMPTY_REQUIRED_KEY_USAGES}
      />
    );

    await waitFor(() => {
      expect(fetchIssuedCertificatesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          forCaId: undefined,
        })
      );
    });
  });

  it('filters out CA certificates by default', async () => {
    fetchIssuedCertificatesMock.mockResolvedValue({
      certificates: [
        buildCertificate('CA Certificate', true),
        buildCertificate('Leaf Certificate', false),
      ],
      nextToken: null,
    });

    render(
      <CertificateSelectorModal
        isOpen
        onOpenChange={() => {}}
        title="Select Certificate"
        description="Choose a certificate"
        onCertificateSelected={() => {}}
        requiredKeyUsages={EMPTY_REQUIRED_KEY_USAGES}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Leaf Certificate')).toBeInTheDocument();
    });
    expect(screen.queryByText('CA Certificate')).not.toBeInTheDocument();
  });

  it('can include CA certificates for CRL signer selection', async () => {
    fetchIssuedCertificatesMock.mockResolvedValue({
      certificates: [
        buildCertificate('CA Certificate', true),
        buildCertificate('Leaf Certificate', false),
      ],
      nextToken: null,
    });

    render(
      <CertificateSelectorModal
        isOpen
        onOpenChange={() => {}}
        title="Select CRL Signer Certificate"
        description="Choose a certificate"
        onCertificateSelected={() => {}}
        requiredKeyUsages={EMPTY_REQUIRED_KEY_USAGES}
        includeCaCertificates
      />
    );

    await waitFor(() => {
      expect(screen.getByText('CA Certificate')).toBeInTheDocument();
    });
    expect(screen.getAllByText('CA').length).toBeGreaterThan(1);
    expect(screen.getByText('Leaf Certificate')).toBeInTheDocument();
  });

  it('adds the selected CA certificate when CRL signer selection is restricted to that CA', async () => {
    fetchIssuedCertificatesMock.mockResolvedValue({
      certificates: [buildCertificate('Leaf Certificate', false)],
      nextToken: null,
    });

    render(
      <CertificateSelectorModal
        isOpen
        onOpenChange={() => {}}
        title="Select CRL Signer Certificate"
        description="Choose a certificate"
        onCertificateSelected={() => {}}
        limitToCAs={[buildCa('ca-1', 'CA 1')]}
        requiredKeyUsages={EMPTY_REQUIRED_KEY_USAGES}
        includeCaCertificates
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('CA 1').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Leaf Certificate')).toBeInTheDocument();
  });

  it('does not duplicate the selected CA certificate when serial formatting differs', async () => {
    fetchIssuedCertificatesMock.mockResolvedValue({
      certificates: [
        {
          ...buildCertificate('CA 1', true),
          serialNumber: 'AA:BB',
        },
      ],
      nextToken: null,
    });

    render(
      <CertificateSelectorModal
        isOpen
        onOpenChange={() => {}}
        title="Select CRL Signer Certificate"
        description="Choose a certificate"
        onCertificateSelected={() => {}}
        limitToCAs={[{ ...buildCa('ca-1', 'CA 1'), serialNumber: 'AABB' }]}
        requiredKeyUsages={EMPTY_REQUIRED_KEY_USAGES}
        includeCaCertificates
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('CA 1')).toHaveLength(1);
    });
  });

  it('marks a certificate as selected when the current selection is a subject key identifier', async () => {
    fetchIssuedCertificatesMock.mockResolvedValue({
      certificates: [
        {
          ...buildCertificate('CRL Signer', false),
          rawApiData: {
            is_ca: false,
            subject_key_id: 'AA:BB:CC',
          },
        },
      ],
      nextToken: null,
    });

    render(
      <CertificateSelectorModal
        isOpen
        onOpenChange={() => {}}
        title="Select CRL Signer Certificate"
        description="Choose a certificate"
        onCertificateSelected={() => {}}
        currentSelectedCertificateId="aabbcc"
        requiredKeyUsages={EMPTY_REQUIRED_KEY_USAGES}
        includeCaCertificates
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Selected')).toBeInTheDocument();
    });
  });
});
