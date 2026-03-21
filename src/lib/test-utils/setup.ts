import { beforeAll, afterEach, afterAll, vi } from 'vitest'
import { server } from './msw-server'
import '@testing-library/jest-dom/vitest'

// Setup MSW
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Mock window.lamassuConfig for API endpoint configuration (matches actual config.js structure)
global.window = global.window || ({} as any);
(window as any).lamassuConfig = {
  LAMASSU_API: 'https://api.test.lamassu.io',
  OIDC_AUTHORITY: 'https://auth.test.lamassu.io',
  OIDC_CLIENT_ID: 'test-client-id',
  CUSTOM_FOOTER_ENABLED: false,
  DEVELOPER_MENU_ENABLED: false,
  AVAILABLE_CONNECTORS: [],
}

// Mock crypto.subtle for Web Crypto API
if (!global.crypto) {
  const { webcrypto } = require('crypto')
  global.crypto = webcrypto as any
}

// Mock atob/btoa for base64 encoding/decoding
// Note: atob expects base64 without whitespace, btoa produces base64
if (!global.atob) {
  global.atob = (str: string) => {
    // Remove any whitespace that might be in the base64 string
    const cleanStr = str.replace(/\s+/g, '')
    return Buffer.from(cleanStr, 'base64').toString('binary')
  }
}
if (!global.btoa) {
  global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64')
}

// Ensure window.atob and window.btoa use the same implementation
if (typeof window !== 'undefined') {
  if (!window.atob) {
    (window as any).atob = global.atob
  }
  if (!window.btoa) {
    (window as any).btoa = global.btoa
  }
}
