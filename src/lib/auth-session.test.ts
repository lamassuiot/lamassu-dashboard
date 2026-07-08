import { afterEach, describe, expect, it } from 'vitest'

import { AUTH_DISABLED_ACCESS_TOKEN, getAccessTokenForApiRequest, getStoredAccessToken, isAuthEnabled } from './auth-session'

describe('auth-session', () => {
  const originalConfig = (window as any).lamassuConfig

  afterEach(() => {
    (window as any).lamassuConfig = originalConfig
  })

  it('treats authentication as enabled by default', () => {
    expect(isAuthEnabled()).toBe(true)
  })

  it('returns the stored access token when authentication is enabled', () => {
    expect(getStoredAccessToken()).toBe('test-access-token')
  })

  it('returns null when authentication is enabled and no token is stored', () => {
    window.localStorage.clear()

    expect(getStoredAccessToken()).toBeNull()
  })

  it('reports authentication as disabled when configured off', () => {
    window.localStorage.clear();
    (window as any).lamassuConfig = {
      ...originalConfig,
      LAMASSU_AUTH_ENABLED: false,
    }

    expect(isAuthEnabled()).toBe(false)
    expect(getStoredAccessToken()).toBeNull()
    expect(getAccessTokenForApiRequest()).toBe(AUTH_DISABLED_ACCESS_TOKEN)
  })

  it('treats string false as authentication disabled', () => {
    ;(window as any).lamassuConfig = {
      ...originalConfig,
      LAMASSU_AUTH_ENABLED: 'FALSE',
    }

    expect(isAuthEnabled()).toBe(false)
    expect(getAccessTokenForApiRequest()).toBe(AUTH_DISABLED_ACCESS_TOKEN)
  })
})
