import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiUpload, createRateTracker, secondsLeft, type UploadProgress } from './upload-with-progress'

vi.mock('./api-client', () => ({
  createApiHeaders: () => new Headers({ Authorization: 'Bearer test-token' }),
}))

class FakeXhr {
  static last: FakeXhr
  upload: { onprogress: ((e: unknown) => void) | null; onload: (() => void) | null } = { onprogress: null, onload: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null
  status = 0
  statusText = ''
  responseText = ''
  headers: Record<string, string> = {}
  method = ''
  url = ''
  sent: unknown = null
  responseHeaders = ''

  constructor() { FakeXhr.last = this }
  open(method: string, url: string) { this.method = method; this.url = url }
  setRequestHeader(key: string, value: string) { this.headers[key] = value }
  getAllResponseHeaders() { return this.responseHeaders }
  send(body: unknown) { this.sent = body }
  abort() { this.onabort?.() }
}

const form = () => {
  const fd = new FormData()
  fd.append('file', new File(['x'.repeat(100)], 'fw.bin'))
  return fd
}

describe('createRateTracker', () => {
  it('measures bytes per second over the window and ignores too little history', () => {
    const rate = createRateTracker(5000)
    expect(rate.add(0, 0)).toBeNull()
    expect(rate.add(100, 200)).toBeNull()
    expect(rate.add(2_000_000, 2000)).toBeCloseTo(1_000_000, -3)
  })

  it('forgets samples older than the window', () => {
    const rate = createRateTracker(5000)
    rate.add(0, 0)
    rate.add(1000, 1000)
    // The first 10 s were fast, the last 5 s were slow: the estimate follows the recent speed.
    rate.add(10_000_000, 10_000)
    expect(rate.add(10_005_000, 15_000)).toBeLessThan(5_000_000)
  })

  it('reports nothing while no bytes moved', () => {
    const rate = createRateTracker()
    rate.add(500, 0)
    expect(rate.add(500, 3000)).toBeNull()
  })
})

describe('secondsLeft', () => {
  it('divides what is left by the speed', () => {
    expect(secondsLeft(1000, 11_000, 1000)).toBe(10)
  })
  it('has no estimate without a speed or once everything is sent', () => {
    expect(secondsLeft(1000, 11_000, null)).toBeNull()
    expect(secondsLeft(11_000, 11_000, 1000)).toBeNull()
  })
})

describe('apiUpload', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends the form with the bearer token and without a Content-Type of its own', async () => {
    const body = form()
    const promise = apiUpload('http://api/artifacts', { body })
    const xhr = FakeXhr.last
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('http://api/artifacts')
    expect(Object.fromEntries(Object.entries(xhr.headers).map(([k, v]) => [k.toLowerCase(), v]))).toEqual({ authorization: 'Bearer test-token' })
    expect(xhr.sent).toBe(body)
    xhr.status = 201
    xhr.responseText = '{"ok":true}'
    xhr.responseHeaders = 'content-type: application/json\r\n'
    xhr.onload?.()
    const response = await promise
    expect(response.status).toBe(201)
    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.json()).toEqual({ ok: true })
  })

  it('answers error statuses as a Response so the callers can read the message', async () => {
    const promise = apiUpload('http://api/x', { body: form() })
    const xhr = FakeXhr.last
    xhr.status = 413
    xhr.responseText = 'too large'
    xhr.onload?.()
    const response = await promise
    expect(response.ok).toBe(false)
    expect(response.status).toBe(413)
    expect(await response.text()).toBe('too large')
  })

  it('accepts a 204 with no body', async () => {
    const promise = apiUpload('http://api/x', { body: form() })
    FakeXhr.last.status = 204
    FakeXhr.last.onload?.()
    expect((await promise).status).toBe(204)
  })

  it('reports progress, then the processing phase once the body is out', async () => {
    const seen: UploadProgress[] = []
    const now = vi.spyOn(performance, 'now')
    const promise = apiUpload('http://api/x', { body: form(), onProgress: (p) => seen.push(p) })
    const xhr = FakeXhr.last

    now.mockReturnValue(1000)
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 1000 })
    // Inside the throttle interval: dropped.
    now.mockReturnValue(1100)
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 200, total: 1000 })
    now.mockReturnValue(2000)
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 600, total: 1000 })
    xhr.upload.onload?.()

    expect(seen.map((p) => [p.phase, p.loaded, p.total])).toEqual([
      ['uploading', 100, 1000],
      ['uploading', 600, 1000],
      ['processing', 1000, 1000],
    ])
    expect(seen[1].bytesPerSecond).toBeCloseTo(500, 0)
    expect(seen[2].bytesPerSecond).toBeNull()

    xhr.status = 200
    xhr.onload?.()
    await promise
  })

  it('rejects on a network error', async () => {
    const promise = apiUpload('http://api/x', { body: form() })
    FakeXhr.last.onerror?.()
    await expect(promise).rejects.toThrow(/network/i)
  })

  it('aborts the request when the signal fires', async () => {
    const controller = new AbortController()
    const promise = apiUpload('http://api/x', { body: form(), signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not even start when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(apiUpload('http://api/x', { body: form(), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
