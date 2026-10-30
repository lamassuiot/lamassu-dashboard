import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IN_MEMORY_DOWNLOAD_LIMIT, saveDownload, type DownloadProgress } from './download-file'

const bodyOf = (...parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      parts.forEach((p) => controller.enqueue(new TextEncoder().encode(p)))
      controller.close()
    },
  })

const response = (body: ReadableStream<Uint8Array> | null, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers })

describe('saveDownload', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
  })
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('where the browser can write straight to disk', () => {
    const withPicker = () => {
      const written: string[] = []
      const writable = new WritableStream<Uint8Array>({ write(chunk) { written.push(new TextDecoder().decode(chunk)) } })
      const picker = vi.fn(async () => ({ createWritable: async () => writable }))
      ;(window as unknown as Record<string, unknown>).showSaveFilePicker = picker
      return { picker, written }
    }

    it('streams the body into the chosen file and reports progress', async () => {
      const { picker, written } = withPicker()
      const seen: DownloadProgress[] = []
      const result = await saveDownload(async () => response(bodyOf('abc', 'defg'), { 'content-length': '7' }), 'fw.bin', (p) => seen.push(p))
      expect(result).toBe('saved')
      expect(picker).toHaveBeenCalledWith({ suggestedName: 'fw.bin' })
      expect(written.join('')).toBe('abcdefg')
      expect(seen.at(-1)).toMatchObject({ loaded: 7, total: 7 })
    })

    it('does not ask the server for anything when the picker is cancelled', async () => {
      ;(window as unknown as Record<string, unknown>).showSaveFilePicker = vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') })
      const open = vi.fn()
      expect(await saveDownload(open, 'fw.bin')).toBe('cancelled')
      expect(open).not.toHaveBeenCalled()
    })

    it('has no size limit of its own, since nothing is held in memory', async () => {
      withPicker()
      const big = String(IN_MEMORY_DOWNLOAD_LIMIT * 10)
      await expect(saveDownload(async () => response(bodyOf('x'), { 'content-length': big }), 'huge.bin')).resolves.toBe('saved')
    })

    it('passes a failed request on to the caller', async () => {
      withPicker()
      await expect(saveDownload(async () => { throw new Error('Could not download artifact: 404') }, 'fw.bin')).rejects.toThrow('404')
    })
  })

  describe('in a browser without that API', () => {
    it('collects the body and hands it to the browser as a download', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      expect(await saveDownload(async () => response(bodyOf('hello'), { 'content-length': '5' }), 'a.txt')).toBe('saved')
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
      expect(click).toHaveBeenCalledTimes(1)
    })

    it('refuses a file too large to hold in memory, saying why', async () => {
      const body = bodyOf('x')
      const cancel = vi.spyOn(body, 'cancel')
      await expect(
        saveDownload(async () => response(body, { 'content-length': String(IN_MEMORY_DOWNLOAD_LIMIT + 1) }), 'huge.bin'),
      ).rejects.toThrow(/Chromium-based browser/)
      expect(cancel).toHaveBeenCalled()
      expect(URL.createObjectURL).not.toHaveBeenCalled()
    })
  })
})
