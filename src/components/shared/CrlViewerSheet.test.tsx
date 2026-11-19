import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { buildCrlDer } from '@/lib-crypto/test-utils/fixtures/crl'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CrlViewerSheet } from './CrlViewerSheet'

vi.mock('@/components/shared/DateDisplay', () => ({
  DateDisplay: ({ date }: { date: string }) => <span>{date}</span>,
}))

vi.mock('@/components/shared/IdentifierDisplay', () => ({
  IdentifierDisplay: ({ value }: { value: string }) => <span>{value}</span>,
}))

const DEFAULT_URL = 'https://va.example.com/crl/ca-1'
const fetchMock = vi.fn()

const crlResponse = (der: ArrayBuffer) => new Response(der, { status: 200 })

const renderSheet = () =>
  render(
    <MemoryRouter>
      <CrlViewerSheet open onOpenChange={() => {}} defaultUrl={DEFAULT_URL} downloadFileName="ca-1.crl" />
    </MemoryRouter>,
  )

describe('CrlViewerSheet', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the default CRL on open and lists its revoked certificates', async () => {
    fetchMock.mockResolvedValue(crlResponse(await buildCrlDer({
      issuerCommonName: 'Edge CA',
      // Before 2050: pkijs encodes it as UTCTime, which has a two-digit year.
      nextUpdate: new Date('2049-01-01T00:00:00Z'),
      crlNumberHex: '2a',
      entries: [{ serialHex: 'abcd', reasonCode: 1 }],
    })))

    renderSheet()

    expect(await screen.findByRole('heading', { name: 'Edge CA' })).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(DEFAULT_URL, expect.anything())
    expect(screen.getByText('42')).toBeInTheDocument()
    const row = screen.getByRole('link', { name: 'abcd' }).closest('tr')!
    expect(screen.getByRole('link', { name: 'abcd' })).toHaveAttribute('href', '/certificates/details?certificateId=abcd')
    expect(within(row).getByText('Key Compromise')).toBeInTheDocument()
    expect(screen.queryByText('This CRL is out of date')).not.toBeInTheDocument()
  })

  it('warns when the CRL is past its next update', async () => {
    fetchMock.mockResolvedValue(crlResponse(await buildCrlDer({ nextUpdate: new Date('2020-01-01T00:00:00Z') })))

    renderSheet()

    expect(await screen.findByText('This CRL is out of date')).toBeInTheDocument()
    expect(screen.getByText('Out of date')).toBeInTheDocument()
  })

  it('shows complete issuer values containing commas in its heading and DN chips', async () => {
    fetchMock.mockResolvedValue(crlResponse(await buildCrlDer({
      issuerCommonName: 'Edge, CN=Branch CA', issuerOrganization: 'Acme, Inc.',
    })))

    renderSheet()

    expect(await screen.findByRole('heading', { name: 'Edge, CN=Branch CA' })).toBeInTheDocument()
    expect(screen.getByText('Acme, Inc.', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('Edge, CN=Branch CA', { selector: 'dd' })).toBeInTheDocument()
  })

  it('shows the HTTP error and retries', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
    renderSheet()

    expect(await screen.findByText('The server responded with HTTP 404.')).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(crlResponse(await buildCrlDer()))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Example CA' })).toBeInTheDocument()
  })

  it('reports a response that is not a CRL', async () => {
    fetchMock.mockResolvedValue(new Response('<html></html>', { status: 200 }))

    renderSheet()

    expect(await screen.findByText(/not a valid DER-encoded CRL/)).toBeInTheDocument()
  })

  it('fetches a custom URL and resets to the default one', async () => {
    const der = await buildCrlDer()
    fetchMock.mockImplementation(async () => crlResponse(der))
    renderSheet()
    await screen.findByRole('heading', { name: 'Example CA' })

    const input = screen.getByLabelText('CRL URL')
    fireEvent.change(input, { target: { value: 'https://other.example.com/crl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))
    await screen.findByRole('heading', { name: 'Example CA' })
    expect(fetchMock).toHaveBeenLastCalledWith('https://other.example.com/crl', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: /Reset to this CA/ }))
    expect(input).toHaveValue(DEFAULT_URL)
    expect(fetchMock).toHaveBeenLastCalledWith(DEFAULT_URL, expect.anything())
  })

  it('filters long lists by serial number or reason', async () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      serialHex: (0x1000 + i).toString(16),
      reasonCode: i === 0 ? 1 : 4,
    }))
    fetchMock.mockResolvedValue(crlResponse(await buildCrlDer({ entries })))
    renderSheet()
    await screen.findByRole('heading', { name: 'Example CA' })

    const filter = screen.getByRole('searchbox', { name: /Filter revoked certificates/ })
    fireEvent.change(filter, { target: { value: '10:0b' } })
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['100b'])

    fireEvent.change(filter, { target: { value: 'compromise' } })
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['1000'])

    fireEvent.change(filter, { target: { value: 'nothing' } })
    expect(screen.getByText(/No revoked certificates match/)).toBeInTheDocument()
  })

  it('renders as a bottom-docked panel that can be closed', async () => {
    fetchMock.mockResolvedValue(crlResponse(await buildCrlDer({ nextUpdate: new Date('2049-01-01T00:00:00Z'), crlNumberHex: '2a' })))
    const onOpenChange = vi.fn()
    const dockSlot = document.createElement('div')
    dockSlot.setAttribute('data-app-bottom-dock', '')
    document.body.appendChild(dockSlot)
    try {
      render(
        <MemoryRouter>
          <TooltipProvider>
            <CrlViewerSheet
              open
              onOpenChange={onOpenChange}
              defaultUrl={DEFAULT_URL}
              downloadFileName="ca-1.crl"
              presentation="docked"
              ca={{ id: 'ca-1', name: 'Edge CA', subject: 'CN=Edge CA, O=Acme' }}
            />
          </TooltipProvider>
        </MemoryRouter>,
      )

      // The header bar names the CA whose CRL is shown; the body keeps only the CRL data.
      const panel = await screen.findByRole('region', { name: 'Edge CA' })
      expect(dockSlot).toContainElement(panel)
      expect(within(panel).getByRole('heading', { name: 'Edge CA' })).toBeInTheDocument()
      expect(within(panel).getByText('CN=Edge CA, O=Acme')).toBeInTheDocument()
      expect(within(panel).getByRole('separator', { name: 'Resize panel' })).toBeInTheDocument()
      expect(await within(panel).findByText('Current')).toBeInTheDocument()
      expect(within(panel).getByText('42')).toBeInTheDocument()
      expect(within(panel).queryByRole('link', { name: 'ca-1' })).not.toBeInTheDocument()

      fireEvent.click(within(panel).getByRole('button', { name: 'Close panel' }))
      expect(onOpenChange).toHaveBeenCalledWith(false)
    } finally {
      dockSlot.remove()
    }
  })
})
