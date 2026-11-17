import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { CertificateData } from '@/types/certificate'
import { SignerCertificateCard } from './SignerCertificateCard'

vi.mock('@/components/shared/DateDisplay', () => ({
  DateDisplay: ({ date }: { date: string }) => <span>{date}</span>,
}))

vi.mock('@/components/shared/IdentifierDisplay', () => ({
  IdentifierDisplay: ({ value }: { value: string }) => <span>{value}</span>,
}))

const issuerDn = 'CN=Lamassu Root CA,O=Lamassu IoT,C=ES'

const certificate = (overrides: Partial<CertificateData> = {}) =>
  ({
    serialNumber: '1a-2b',
    subject: 'CN=CRL Signer',
    issuer: issuerDn,
    validTo: '2030-01-01T00:00:00Z',
    ...overrides,
  }) as CertificateData

const renderCard = (cert: CertificateData) =>
  render(
    <MemoryRouter>
      <SignerCertificateCard certificate={cert} />
    </MemoryRouter>,
  )

describe('SignerCertificateCard issuer', () => {
  it('shows the full issuer DN in a tooltip when the issuer link gets keyboard focus', async () => {
    renderCard(certificate({ issuerCaId: 'ca-1' }))

    const link = screen.getByRole('link', { name: 'Lamassu Root CA' })
    expect(link).toHaveAttribute('href', '/certificate-authorities/details?caId=ca-1')
    expect(link).not.toHaveAttribute('title')

    fireEvent.focus(link)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(issuerDn)
  })

  it('gives an issuer without a CA a focusable trigger for the DN tooltip', async () => {
    renderCard(certificate())

    const trigger = screen.getByRole('button', { name: 'Lamassu Root CA' })
    fireEvent.focus(trigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(issuerDn)
  })

  it('renders plain text when the DN adds nothing to the issuer name', () => {
    renderCard(certificate({ issuer: 'Lamassu Root CA' }))

    expect(screen.getByText('Issued by Lamassu Root CA')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lamassu Root CA' })).not.toBeInTheDocument()
  })
})
