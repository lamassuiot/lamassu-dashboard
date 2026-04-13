import { afterEach, describe, expect, it } from 'vitest'

import { requireAccessToken } from './auth-session'

describe('auth-session', () => {
  const originalConfig = (window as any).lamassuConfig

  afterEach(() => {
    (window as any).lamassuConfig = originalConfig
  })

  it('returns the stored access token when authentication is enabled', () => {
    expect(requireAccessToken()).toBe('test-access-token')
  })

  it('throws when authentication is enabled and no token is stored', () => {
    window.localStorage.clear()

    expect(() => requireAccessToken()).toThrow('User not authenticated.')
  })

  it('does not throw when authentication is disabled and no token is stored', () => {
    window.localStorage.clear();
    (window as any).lamassuConfig = {
      ...originalConfig,
      LAMASSU_AUTH_ENABLED: false,
    }

    expect(requireAccessToken()).toBe('')
  })
})
