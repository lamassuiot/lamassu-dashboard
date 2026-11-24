import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DecodedCertificateSections, decodeCertificatePem, type DecodedCertInfo } from './DecodedCertificateSections'
import { VALID_RSA_CERT_PEM } from '@/lib/test-utils/fixtures/certificates'

const identifierMode = vi.hoisted(() => ({ current: 'with-separators' as 'with-separators' | 'without-separators' }))

vi.mock('@/contexts/IdentifierDisplayContext', () => ({
  useIdentifierDisplay: () => ({ mode: identifierMode.current }),
}))

vi.mock('@/components/shared/CrlViewerSheet', () => ({
  CrlViewerSheet: ({ open, defaultUrl, downloadFileName }: { open: boolean; defaultUrl: string; downloadFileName: string }) =>
    open ? <div data-testid="crl-viewer" data-file={downloadFileName}>{defaultUrl}</div> : null,
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

  it('shows the algorithm family of the public key and the signature algorithm beside the CA flag', () => {
    const { rerender } = render(<DecodedCertificateSections info={info({ publicKeyAlgorithm: 'RSA (2048 bits)', signatureAlgorithm: 'sha256WithRSAEncryption' })} />)
    const publicKey = screen.getByRole('group', { name: 'Public Key' })
    expect(within(publicKey).getByText('T')).toBeInTheDocument()
    expect(within(publicKey).getByText('RSA (2048 bits)')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Signature' })).getByText('sha256WithRSAEncryption')).toBeInTheDocument()

    rerender(<DecodedCertificateSections info={info({ publicKeyAlgorithm: 'ML-DSA-65', signatureAlgorithm: 'ML-DSA-65' })} />)
    expect(within(screen.getByRole('group', { name: 'Public Key' })).getByText('PQ')).toBeInTheDocument()

    rerender(<DecodedCertificateSections info={info({ publicKeyAlgorithm: 'Composite-Signature MLDSA65-RSA3072-PSS' })} />)
    expect(within(screen.getByRole('group', { name: 'Public Key' })).getByText('PQ/T')).toBeInTheDocument()
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

  it('fetches and shows the CRL of an HTTP distribution point', () => {
    render(<DecodedCertificateSections info={info({ crlDistributionPoints: ['http://crl.example.com/ca'] })} />)
    expect(screen.queryByTestId('crl-viewer')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fetch & show CRL from http://crl.example.com/ca' }))

    expect(screen.getByTestId('crl-viewer')).toHaveTextContent('http://crl.example.com/ca')
    expect(screen.getByTestId('crl-viewer')).toHaveAttribute('data-file', 'ca.crl')
  })

  it('cannot fetch an LDAP distribution point', () => {
    render(<DecodedCertificateSections info={info({ crlDistributionPoints: ['ldap://ldap.example.com/CN=CRL,C=ES'] })} />)

    expect(screen.getByRole('button', { name: /Browsers can only fetch HTTP\(S\) URLs/ })).toBeDisabled()
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
    expect(within(section('Certificate Details')).getByRole('group', { name: 'Public Key' })).toHaveTextContent('RSA (2048 bits)')
    expect(within(section('Certificate Details')).getByRole('group', { name: 'Public Key' })).toContainElement(screen.getByLabelText(/^Key strength:/))
    expect(screen.queryByLabelText('Public Key Algorithm')).not.toBeInTheDocument()
  })
})
