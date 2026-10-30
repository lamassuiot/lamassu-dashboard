import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UploadProgressBar } from './UploadProgressBar'

const base = { loaded: 0, total: 0, phase: 'uploading' as const, bytesPerSecond: null, secondsLeft: null }

describe('UploadProgressBar', () => {
  it('renders nothing without an upload', () => {
    const { container } = render(<UploadProgressBar progress={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows bytes, speed and time left while sending', () => {
    render(<UploadProgressBar progress={{
      ...base,
      fileName: 'rootfs.swu',
      loaded: 2.5 * 1024 ** 3,
      total: 10 * 1024 ** 3,
      bytesPerSecond: 1024 * 1024,
      secondsLeft: 7500,
    }} />)
    expect(screen.getByText('rootfs.swu')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('2.5 GB of 10 GB · 1 MB/s · 2 h 5 min left')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toBeInTheDocument()
  })

  it('names the file among several', () => {
    render(<UploadProgressBar progress={{ ...base, fileName: 'b.bin', fileIndex: 1, fileCount: 3, loaded: 1, total: 2 }} />)
    expect(screen.getByText('b.bin (file 2 of 3)')).toBeInTheDocument()
  })

  it('says the server is still storing once the body is out, instead of sitting at 100%', () => {
    render(<UploadProgressBar progress={{ ...base, phase: 'processing', loaded: 1024 ** 3, total: 1024 ** 3 }} />)
    expect(screen.getByText('Storing…')).toBeInTheDocument()
    expect(screen.getByText(/The server is storing the file/)).toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })
})
