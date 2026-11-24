import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DecodedCertificateSections, decodeCertificatePem, type DecodedCertInfo } from './DecodedCertificateSections'
import { VALID_RSA_CERT_PEM } from '@/lib/test-utils/fixtures/certificates'

const identifierMode = vi.hoisted(() => ({ current: 'with-separators' as 'with-separators' | 'without-separators' }))

vi.mock('@/contexts/IdentifierDisplayContext', () => ({
  useIdentifierDisplay: () => ({ mode: identifierMode.current }),
}))

const info = (overrides: Partial<DecodedCertInfo> = {}): DecodedCertInfo => ({
  subjectFields: { cn: 'device-01', c: 'ES', l: '', o: 'Acme Devices' },
  issuerFields: { cn: 'Acme Issuing CA', c: 'ES', o: 'Acme' },
  serialNumber: '0a:1b:2c',
  isCa: false,
  keyUsage: ['digitalSignature'],
  extendedKeyUsage: ['ClientAuth'],
  ...overrides,
})

const section = (name: string) => screen.getByRole('region', { name })

describe('DecodedCertificateSections', () => {
  beforeEach(() => {
    identifierMode.current = 'with-separators'
  })

  it('shows issuer and subject distinguished names in their own sections', () => {
    render(<DecodedCertificateSections info={info()} />)

    expect(within(section('Issuer Distinguished Name')).getByLabelText('Common Name (CN)')).toHaveValue('Acme Issuing CA')
    expect(within(section('Subject Distinguished Name')).getByLabelText('Common Name (CN)')).toHaveValue('device-01')
    expect(within(section('Subject Distinguished Name')).getByLabelText('Organization (O)')).toHaveValue('Acme Devices')
  })

  it('tells a missing attribute apart from one with an empty value', () => {
    render(<DecodedCertificateSections info={info()} />)
    const subject = within(section('Subject Distinguished Name'))

    expect(subject.getByLabelText('Locality (L)')).toHaveValue('')
    expect(subject.getByLabelText('Locality (L)')).toHaveAttribute('placeholder', 'Empty string ("")')
    expect(subject.getByLabelText('State / Province (ST)')).toHaveAttribute('placeholder', 'Not specified')
    expect(subject.getByLabelText('Common Name (CN)')).not.toHaveAttribute('placeholder')
    expect(screen.getByLabelText('Subject Key Identifier')).toHaveAttribute('placeholder', 'Not specified')
  })

  it('warns about a missing CA flag only when a CA certificate is expected', () => {
    const { rerender } = render(<DecodedCertificateSections info={info()} />)
    expect(screen.queryByText('Not a CA Certificate')).not.toBeInTheDocument()

    rerender(<DecodedCertificateSections info={info()} expectCa />)
    expect(screen.getByText('Not a CA Certificate')).toBeInTheDocument()

    rerender(<DecodedCertificateSections info={info({ isCa: true })} expectCa />)
    expect(screen.queryByText('Not a CA Certificate')).not.toBeInTheDocument()
  })

  it('shows the CA flag and path length', () => {
    const { rerender } = render(<DecodedCertificateSections info={info({ isCa: true, pathLenConstraint: 0 })} />)
    const card = () => screen.getByRole('group', { name: 'Is CA' })

    expect(within(card()).getByText('Certificate Authority')).toBeInTheDocument()
    expect(within(card()).getByText('CA:TRUE · pathlen:0')).toBeInTheDocument()

    rerender(<DecodedCertificateSections info={info()} />)
    expect(within(card()).getByText('End-entity certificate')).toBeInTheDocument()
    expect(within(card()).getByText('CA:FALSE')).toBeInTheDocument()
  })

  it('formats identifiers with the display preference', () => {
    const { rerender } = render(<DecodedCertificateSections info={info({ subjectKeyId: 'a1b2c3' })} />)
    expect(screen.getByLabelText('Serial Number')).toHaveValue('0a:1b:2c')
    expect(screen.getByLabelText('Subject Key Identifier')).toHaveValue('a1:b2:c3')

    identifierMode.current = 'without-separators'
    rerender(<DecodedCertificateSections info={info({ subjectKeyId: 'a1b2c3' })} />)
    expect(screen.getByLabelText('Serial Number')).toHaveValue('0a1b2c')
    expect(screen.getByLabelText('Subject Key Identifier')).toHaveValue('a1b2c3')
  })

  it('shows readable usage names', () => {
    render(<DecodedCertificateSections info={info()} />)

    expect(screen.getByText('Digital Signature')).toBeInTheDocument()
    expect(screen.getByText('Client Auth')).toBeInTheDocument()
  })

  it('links only http(s) distribution URLs', () => {
    render(
      <DecodedCertificateSections
        info={info({
          crlDistributionPoints: ['http://crl.example.com/ca.crl', 'ldap://ldap.example.com/cn=ca'],
          ocspUrls: ['javascript:alert(1)'],
        })}
      />,
    )

    expect(screen.getByRole('link', { name: 'http://crl.example.com/ca.crl' })).toHaveAttribute('href', 'http://crl.example.com/ca.crl')
    expect(screen.getByText('ldap://ldap.example.com/cn=ca').closest('a')).toBeNull()
    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull()
  })

  it('renders the extra content a page passes in', () => {
    render(
      <DecodedCertificateSections
        info={info()}
        detailsExtra={<span>Private key link</span>}
        issuerAside={<button type="button">Open issuer CA</button>}
      />,
    )

    expect(within(section('Certificate Details')).getByText('Private key link')).toBeInTheDocument()
    expect(within(section('Issuer Distinguished Name')).getByRole('button', { name: 'Open issuer CA' })).toBeInTheDocument()
  })

  it('renders a decoded PEM certificate', async () => {
    render(<DecodedCertificateSections info={await decodeCertificatePem(VALID_RSA_CERT_PEM)} />)

    expect(within(section('Subject Distinguished Name')).getByLabelText('Organization (O)')).toHaveValue('Internet Widgits Pty Ltd')
    expect(screen.getByLabelText('Public Key Algorithm')).toHaveValue('RSA (2048 bits)')
  })
})
