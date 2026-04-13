import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch, createApiHeaders } from './api-client'

describe('api-client', () => {
  const originalConfig = (window as any).lamassuConfig

  afterEach(() => {
    (window as any).lamassuConfig = originalConfig
  })

  it('includes the Authorization header for required auth when a token is available', () => {
    const headers = createApiHeaders()

    expect(headers.get('Authorization')).toBe('Bearer test-access-token')
  })

  it('omits the Authorization header when auth is disabled', () => {
    window.localStorage.clear();
    (window as any).lamassuConfig = {
      ...originalConfig,
      LAMASSU_AUTH_ENABLED: false,
    }

    const headers = createApiHeaders({ 'Content-Type': 'application/json' })

    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.has('Authorization')).toBe(false)
  })

  it('throws for auth-enabled requests when auth is enabled and no token is available', () => {
    window.localStorage.clear()

    expect(() => createApiHeaders()).toThrow('User not authenticated.')
  })

  it('omits the Authorization header when auth is disabled for a request', () => {
    const headers = createApiHeaders(undefined, false)

    expect(headers.has('Authorization')).toBe(false)
  })

  it('preserves an explicitly provided Authorization header when auth handling is disabled', () => {
    const headers = createApiHeaders({ Authorization: 'Bearer manual-token' }, false)

    expect(headers.get('Authorization')).toBe('Bearer manual-token')
  })

  it('removes an explicitly provided Authorization header when auth resolves to no token', async () => {
    window.localStorage.clear()
    ;(window as any).lamassuConfig = {
      ...originalConfig,
      LAMASSU_AUTH_ENABLED: false,
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    await apiFetch('https://example.com/health', {
      headers: {
        Authorization: 'Bearer stale-token',
      },
    })

    const [, init] = fetchSpy.mock.calls[0]
    const requestHeaders = new Headers(init?.headers)

    expect(requestHeaders.has('Authorization')).toBe(false)

    fetchSpy.mockRestore()
  })
})
