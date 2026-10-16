import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKER_SOURCE, checkJsFilterSyntax, runJsFilter } from './js-filter'

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

  it('reports the syntax check as unchecked, not valid, when no worker can start', async () => {
    vi.stubGlobal('Worker', ThrowingWorker)

    await expect(checkJsFilterSyntax('function () { return true; }')).resolves.toEqual({ status: 'unchecked' })
  })

  it('treats a worker script that fails to load as unavailable, not as a syntax error', async () => {
    vi.stubGlobal('Worker', FailingWorker)

    await expect(checkJsFilterSyntax('function () { return true; }')).resolves.toEqual({ status: 'unchecked' })
  })

  it('reports the syntax check as unchecked when Web Workers are not defined at all', async () => {
    vi.stubGlobal('Worker', undefined)

    await expect(checkJsFilterSyntax('function () { return true; }')).resolves.toEqual({ status: 'unchecked' })
  })

  it('reports a timeout for a filter that never answers and terminates the worker', async () => {
    vi.stubGlobal('Worker', HangingWorker)

    const result = await runJsFilter('function () { while (true) {} }', {}, 20)

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('did not finish') })
    expect(HangingWorker.instances[0].terminate).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})

/**
 * jsdom has no Worker, so this one runs the real worker script against a fake global scope.
 * Messages are delivered asynchronously, like a real worker.
 */
class ScriptWorker {
  onmessage: ((message: { data: unknown }) => void) | null = null
  onerror: unknown = null
  terminate = vi.fn()
  static scope: Record<string, unknown> & { onmessage: ((message: { data: unknown }) => void) | null }
  private readonly scope: typeof ScriptWorker.scope

  constructor() {
    this.scope = {
      onmessage: null,
      fetch: () => 'network',
      XMLHttpRequest: class {},
      postMessage: (data: unknown) => queueMicrotask(() => this.onmessage?.({ data })),
    }
    ScriptWorker.scope = this.scope
    new Function('self', WORKER_SOURCE)(this.scope)
  }

  postMessage(data: unknown) {
    queueMicrotask(() => this.scope.onmessage?.({ data }))
  }
}

describe('js-filter worker script', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: vi.fn() }))
    vi.stubGlobal('Worker', ScriptWorker)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const event = { type: 'cert.expiring', data: { daysLeft: 5 } }

  it('reports a match when the filter returns true', async () => {
    await expect(runJsFilter('function (e) { return e.data.daysLeft < 10; }', event)).resolves.toEqual({
      ok: true,
      returnType: 'boolean',
      match: true,
    })
  })

  it('reports no match when the filter returns false', async () => {
    await expect(runJsFilter('function (e) { return e.data.daysLeft > 10; }', event)).resolves.toEqual({
      ok: true,
      returnType: 'boolean',
      match: false,
    })
  })

  it('never treats a truthy non-boolean as a match and reports its type', async () => {
    await expect(runJsFilter('function () { return "yes"; }', event)).resolves.toEqual({
      ok: true,
      returnType: 'string',
      match: false,
    })
    await expect(runJsFilter('function () {}', event)).resolves.toMatchObject({ returnType: 'undefined', match: false })
  })

  it('reports errors thrown by the filter', async () => {
    await expect(runJsFilter('function () { throw new Error("boom"); }', event)).resolves.toEqual({
      ok: false,
      error: 'boom',
    })
  })

  it('reports a syntax error from the check without running the filter', async () => {
    await expect(checkJsFilterSyntax('function (e) { return ; ]')).resolves.toEqual({ status: 'invalid', error: expect.any(String) })
    await expect(checkJsFilterSyntax('function (e) { return true; }')).resolves.toEqual({ status: 'valid' })
  })

  it('removes network and storage APIs from the worker scope', async () => {
    const result = await runJsFilter('function () { return typeof fetch; }', event)
    expect(result.ok).toBe(true)

    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches']) {
      expect(ScriptWorker.scope[name]).toBeUndefined()
    }
  })
})
