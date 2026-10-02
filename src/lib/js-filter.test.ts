import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkJsFilterSyntax, runJsFilter } from './js-filter'

class ThrowingWorker {
  constructor() {
    throw new DOMException('Refused to create a worker from blob: (CSP)', 'SecurityError')
  }
}

/** Worker whose script fails to load, which browsers report through `onerror`. */
class FailingWorker {
  onerror: ((e: { message: string }) => void) | null = null
  onmessage: unknown = null
  terminate = vi.fn()
  postMessage() {
    queueMicrotask(() => this.onerror?.({ message: 'Script load blocked' }))
  }
}

/** Worker that never answers, like a filter stuck in an infinite loop. */
class HangingWorker {
  onerror: unknown = null
  onmessage: unknown = null
  static instances: HangingWorker[] = []
  terminate = vi.fn()
  postMessage() {}
  constructor() {
    HangingWorker.instances.push(this)
  }
}

describe('js-filter when the worker cannot run', () => {
  const createObjectURL = vi.fn(() => 'blob:test')
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    HangingWorker.instances = []
  })

  it('does not reject when the worker constructor throws, and releases the object URL', async () => {
    vi.stubGlobal('Worker', ThrowingWorker)

    await expect(runJsFilter('function () { return true; }', {})).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Content Security Policy'),
    })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('skips the syntax check instead of flagging valid code when no worker can start', async () => {
    vi.stubGlobal('Worker', ThrowingWorker)

    await expect(checkJsFilterSyntax('function () { return true; }')).resolves.toBeNull()
  })

  it('treats a worker script that fails to load as unavailable, not as a syntax error', async () => {
    vi.stubGlobal('Worker', FailingWorker)

    await expect(checkJsFilterSyntax('function () { return true; }')).resolves.toBeNull()
  })

  it('skips the syntax check when Web Workers are not defined at all', async () => {
    vi.stubGlobal('Worker', undefined)

    await expect(checkJsFilterSyntax('function () { return true; }')).resolves.toBeNull()
  })

  it('reports a timeout for a filter that never answers and terminates the worker', async () => {
    vi.stubGlobal('Worker', HangingWorker)

    const result = await runJsFilter('function () { while (true) {} }', {}, 20)

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('did not finish') })
    expect(HangingWorker.instances[0].terminate).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
