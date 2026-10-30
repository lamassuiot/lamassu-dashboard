import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReusableSoftwareModule } from '@/types/iot'

const { fetchCatalogModuleFileMock, saveDownloadMock } = vi.hoisted(() => ({
  fetchCatalogModuleFileMock: vi.fn(),
  saveDownloadMock: vi.fn(),
}))

vi.mock('@/lib/iot-api', () => ({
  fetchCatalogModuleFile: fetchCatalogModuleFileMock,
  setSoftwareModuleReleaseNotes: vi.fn(),
  updateCatalogModule: vi.fn(),
}))
vi.mock('@/lib/download-file', () => ({ saveDownload: saveDownloadMock }))
vi.mock('@/lib/toast', () => ({ sileo: { success: vi.fn(), error: vi.fn() } }))

import { ModuleDetailPanel, type GroupedModule } from './module-detail-panel'

const use = (over: Partial<ReusableSoftwareModule> = {}): ReusableSoftwareModule => ({
  id: 'mod-1',
  key: 'application:agent',
  type: 'application',
  name: 'agent',
  version: '1.0.0',
  built: false,
  locked: false,
  artifacts: [
    { id: 'a1', name: 'agent', version: '1.0.0', filename: 'agent.bin', size: 2048 },
    { id: 'a2', name: 'agent', version: '1.0.0', filename: 'agent.conf', size: 12 },
  ],
  source_distribution_set_name: 'gateway',
  source_distribution_set_version: '1.0.0',
  source_group_id: 'g1',
  shared: false,
  ...over,
} as ReusableSoftwareModule)

const grouped = (u: ReusableSoftwareModule): GroupedModule => ({ key: u.key, type: u.type, name: u.name, shared: false, uses: [u] })

const renderPanel = (u: ReusableSoftwareModule) =>
  render(
    <MemoryRouter>
      <ModuleDetailPanel
        module={grouped(u)}
        lockSupported
        perModuleDeliverables
        onClose={() => {}}
        onSaved={() => {}}
        onAddArtifact={() => {}}
        onNewVersion={() => {}}
      />
    </MemoryRouter>,
  )

describe('ModuleDetailPanel file downloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveDownloadMock.mockImplementation(async (open: () => Promise<Response>) => { await open(); return 'saved' })
    fetchCatalogModuleFileMock.mockResolvedValue(new Response('x'))
  })

  it('offers a download for every stored file, saved under its own name', async () => {
    renderPanel(use())
    // The overview lists the files...
    expect(screen.getAllByRole('button', { name: /^Download agent\.(bin|conf)$/ })).toHaveLength(2)

    // ...and so does the Artifacts tab, in its table.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Artifacts/ }), { button: 0 })
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: /^Download agent\.(bin|conf)$/ })).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Download agent.conf' }))
    await waitFor(() => expect(saveDownloadMock).toHaveBeenCalledTimes(1))
    expect(saveDownloadMock.mock.calls[0][1]).toBe('agent.conf')
    expect(fetchCatalogModuleFileMock).toHaveBeenCalledWith('mod-1', 'a2')
  })

  it('cannot download from a backend that gives the module no id, and says why', () => {
    renderPanel(use({ id: undefined }))
    const [button] = screen.getAllByRole('button', { name: 'Download agent.bin' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/does not expose the module id/))
  })
})
