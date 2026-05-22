import React from 'react';
import { render, waitFor } from '@testing-library/react';
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

vi.mock('./SelectableCertificateItem', () => ({
  SelectableCertificateItem: () => <li>certificate</li>,
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
});
