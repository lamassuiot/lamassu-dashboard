import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useCrlSettingsList, type CrlSettingsListItem } from '@/hooks/useCrlSettingsList'
import { VerificationAuthoritiesClient } from './VerificationAuthoritiesClient'

vi.mock('@/hooks/useCrlSettingsList', () => ({ useCrlSettingsList: vi.fn() }))

const item = (caId: string, status: 'ACTIVE' | 'FINAL' | 'ARCHIVED', caName: string | null, caSubject: string | null): CrlSettingsListItem => ({
  settings: {
    ca_id: caId, status, latest_crl: null,
    crl_options: { refresh_interval: '1h', validity: '7d', signer_serial_number: '', regenerate_on_revoke: true },
  },
  caName, caSubject, cryptoEngine: null,
})
const items = [
  item('ca-a', 'ACTIVE', 'Root CA', 'CN=Root CA, O=Acme'),
  item('ca-b', 'FINAL', 'Edge CA', 'CN=Edge CA, O=Branch'),
  item('deleted-id', 'ARCHIVED', null, null),
]

function renderPage() {
  return render(<MemoryRouter><TooltipProvider><VerificationAuthoritiesClient /></TooltipProvider></MemoryRouter>)
}

describe('VerificationAuthoritiesClient', () => {
  let state: ReturnType<typeof useCrlSettingsList>

  beforeEach(() => {
    state = {
      items, isLoading: false, error: null, busyCaIds: new Set(),
      reload: vi.fn(), download: vi.fn(), purge: vi.fn(),
    }
    vi.mocked(useCrlSettingsList).mockReturnValue(state)
  })

  it.each([
    ['  ROOT ca  ', 'Root CA'],
    ['o=branch', 'Edge CA'],
    ['DELETED-ID', 'Deleted CA'],
  ])('filters by name, DN or ID using %s', (search, expectedName) => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Filter by CA Name, DN or ID'), { target: { value: search } })
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(within(rows[1]).getByRole('button', { name: expectedName })).toBeInTheDocument()
  })

  it('combines the status and text filters', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Advanced Search/ }))
    // Radix opens menus on pointerdown, and the visible <label> names the trigger.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Status' }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Final' }))
    // The open menu hides the page from the accessibility tree.
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Edge CA' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filter by CA Name, DN or ID'), { target: { value: 'root' } })
    expect(screen.getByRole('heading', { name: 'No Matching CRL Settings Found' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the filter empty state and restores the rows when cleared', () => {
    renderPage()
    const filter = screen.getByLabelText('Filter by CA Name, DN or ID')
    fireEvent.change(filter, { target: { value: 'missing' } })
    expect(screen.getByRole('heading', { name: 'No Matching CRL Settings Found' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fireEvent.change(filter, { target: { value: '' } })
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4)
  })

  it('shows the unfiltered empty state when there are no settings', () => {
    vi.mocked(useCrlSettingsList).mockReturnValue({ ...state, items: [] })
    renderPage()
    expect(screen.getByRole('heading', { name: 'No CRL Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No Matching CRL Settings Found' })).not.toBeInTheDocument()
  })

  it('does not show an empty state while loading or after a load error', () => {
    vi.mocked(useCrlSettingsList).mockReturnValue({ ...state, items: [], isLoading: true })
    const { unmount } = renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading CRL settings…')
    expect(screen.queryByRole('heading', { name: 'No CRL Settings' })).not.toBeInTheDocument()
    unmount()
    vi.mocked(useCrlSettingsList).mockReturnValue({ ...state, items: [], error: 'Service unavailable' })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable')
    expect(screen.queryByRole('heading', { name: 'No CRL Settings' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again?' }))
    expect(state.reload).toHaveBeenCalledOnce()
  })
})
