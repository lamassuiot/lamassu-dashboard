import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  get_KMS_API_BASE_URL,
  get_CA_API_BASE_URL,
  get_DEV_MANAGER_API_BASE_URL,
  get_DMS_MANAGER_API_BASE_URL,
  get_ALERTS_API_BASE_URL,
  get_VA_CORE_API_BASE_URL,
  get_VA_API_BASE_URL,
  get_EST_API_BASE_URL,
  getPublicAPIUrl,
  handleApiError,
} from './api-domains'

describe('api-domains', () => {
  describe('URL builders', () => {
    it('should build KMS API URL from window.lamassuConfig', () => {
      const url = get_KMS_API_BASE_URL()
      expect(url).toBe('https://api.test.lamassu.io/kms/v1')
    })

    it('should build CA API URL from window.lamassuConfig', () => {
      const url = get_CA_API_BASE_URL()
      expect(url).toBe('https://api.test.lamassu.io/ca/v1')
    })

    it('should build DEV_MANAGER API URL from window.lamassuConfig', () => {
      const url = get_DEV_MANAGER_API_BASE_URL()
      expect(url).toBe('https://api.test.lamassu.io/devmanager/v1')
    })

    it('should build DMS_MANAGER API URL from window.lamassuConfig', () => {
      const url = get_DMS_MANAGER_API_BASE_URL()
      expect(url).toBe('https://api.test.lamassu.io/dmsmanager/v1')
    })

    it('should build ALERTS API URL from window.lamassuConfig', () => {
      const url = get_ALERTS_API_BASE_URL()
      expect(url).toBe('https://api.test.lamassu.io/alerts/v1')
    })

    it('should build VA_CORE API URL from window.lamassuConfig', () => {
      const url = get_VA_CORE_API_BASE_URL()
      expect(url).toBe('https://api.test.lamassu.io/va')
    })

    it('should build VA API URL from window.lamassuConfig', () => {
      const url = get_VA_API_BASE_URL()
      expect(url).toBe('https://api.test.lamassu.io/va/v1')
    })

    it('should build EST API URL from window.lamassuConfig', () => {
      const url = get_EST_API_BASE_URL()
      expect(url).toBe('https://api.test.lamassu.io/dmsmanager/.well-known/est')
    })
  })

  describe('getPublicAPIUrl', () => {
    let originalConfig: any

    beforeEach(() => {
      // Save original config
      originalConfig = (window as any).lamassuConfig
    })

    afterEach(() => {
      // Restore original config
      (window as any).lamassuConfig = originalConfig
    })

    it('should use LAMASSU_PUBLIC_API when available', () => {
      (window as any).lamassuConfig = {
        LAMASSU_API: 'https://internal.api.com',
        LAMASSU_PUBLIC_API: 'https://public.api.com',
      }

      const url = getPublicAPIUrl()
      expect(url).toBe('https://public.api.com')
    })

    it('should fallback to LAMASSU_API when LAMASSU_PUBLIC_API not set', () => {
      (window as any).lamassuConfig = {
        LAMASSU_API: 'https://internal.api.com',
      }

      const url = getPublicAPIUrl()
      expect(url).toBe('https://internal.api.com')
    })

    it('should use public API override for EST endpoint', () => {
      (window as any).lamassuConfig = {
        LAMASSU_API: 'https://internal.api.com',
        LAMASSU_PUBLIC_API: 'https://public.api.com',
      }

      const url = get_EST_API_BASE_URL()
      expect(url).toBe('https://public.api.com/dmsmanager/.well-known/est')
    })
  })

  describe('handleApiError', () => {
    it('should return parsed JSON for successful response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: 'success' }),
      } as Response

      const result = await handleApiError(mockResponse, 'Test operation failed')
      expect(result).toEqual({ data: 'success' })
    })

    it('should throw error with default message for failed response without JSON body', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Not JSON')
        },
      } as Response

      await expect(
        handleApiError(mockResponse, 'Test operation failed')
      ).rejects.toThrow('Test operation failed. HTTP error 500')
    })

    it('should throw error with API error message when available', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: async () => ({ err: 'Invalid request parameters' }),
      } as Response

      await expect(
        handleApiError(mockResponse, 'Test operation failed')
      ).rejects.toThrow('Test operation failed: Invalid request parameters')
    })

    it('should handle error with "message" field instead of "err"', async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        json: async () => ({ message: 'Forbidden access' }),
      } as Response

      await expect(
        handleApiError(mockResponse, 'Test operation failed')
      ).rejects.toThrow('Test operation failed: Forbidden access')
    })

    it('should handle 404 errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: async () => ({ err: 'Resource not found' }),
      } as Response

      await expect(
        handleApiError(mockResponse, 'Fetch resource failed')
      ).rejects.toThrow('Fetch resource failed: Resource not found')
    })

    it('should handle network errors without JSON response', async () => {
      const mockResponse = {
        ok: false,
        status: 0,
        json: async () => {
          throw new Error('Network error')
        },
      } as Response

      await expect(
        handleApiError(mockResponse, 'Network request failed')
      ).rejects.toThrow('Network request failed. HTTP error 0')
    })
  })

  describe('environment variable fallback', () => {
    it('should use LAMASSU_API from window.lamassuConfig in test environment', () => {
      // In test environment, window.lamassuConfig should be set by setup.ts
      const url = get_CA_API_BASE_URL()
      expect(url).toContain('api.test.lamassu.io')
    })
  })

  describe('URL structure validation', () => {
    it('should build URLs with correct version paths', () => {
      expect(get_KMS_API_BASE_URL()).toMatch(/\/kms\/v1$/)
      expect(get_CA_API_BASE_URL()).toMatch(/\/ca\/v1$/)
      expect(get_DEV_MANAGER_API_BASE_URL()).toMatch(/\/devmanager\/v1$/)
      expect(get_DMS_MANAGER_API_BASE_URL()).toMatch(/\/dmsmanager\/v1$/)
      expect(get_ALERTS_API_BASE_URL()).toMatch(/\/alerts\/v1$/)
      expect(get_VA_API_BASE_URL()).toMatch(/\/va\/v1$/)
    })

    it('should build EST URL with well-known path', () => {
      const url = get_EST_API_BASE_URL()
      expect(url).toContain('/.well-known/est')
    })

    it('should not have trailing slashes in base URLs', () => {
      const urls = [
        get_KMS_API_BASE_URL(),
        get_CA_API_BASE_URL(),
        get_DEV_MANAGER_API_BASE_URL(),
        get_DMS_MANAGER_API_BASE_URL(),
        get_ALERTS_API_BASE_URL(),
        get_VA_API_BASE_URL(),
        get_EST_API_BASE_URL(),
      ]

      urls.forEach((url) => {
        expect(url).not.toMatch(/\/$/)
      })
    })
  })
})
