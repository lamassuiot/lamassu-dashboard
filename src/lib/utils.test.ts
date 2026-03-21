import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cn, setCookie, getCookie } from './utils'

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      const result = cn('foo', 'bar')
      expect(result).toBe('foo bar')
    })

    it('should handle conditional classes', () => {
      const result = cn('foo', false && 'bar', 'baz')
      expect(result).toBe('foo baz')
    })

    it('should merge Tailwind classes correctly', () => {
      const result = cn('px-2 py-1', 'px-4')
      expect(result).toBe('py-1 px-4')
    })

    it('should handle arrays', () => {
      const result = cn(['foo', 'bar'], 'baz')
      expect(result).toBe('foo bar baz')
    })

    it('should handle objects', () => {
      const result = cn({ foo: true, bar: false, baz: true })
      expect(result).toBe('foo baz')
    })

    it('should handle empty input', () => {
      const result = cn()
      expect(result).toBe('')
    })

    it('should handle null and undefined', () => {
      const result = cn('foo', null, undefined, 'bar')
      expect(result).toBe('foo bar')
    })
  })

  describe('setCookie', () => {
    beforeEach(() => {
      // Clear all cookies
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`)
      })
    })

    it('should set a cookie with default max-age', () => {
      setCookie('test', 'value')
      
      expect(document.cookie).toContain('test=value')
    })

    it('should set a cookie with custom max-age', () => {
      setCookie('test', 'value', 3600)
      
      expect(document.cookie).toContain('test=value')
    })

    it('should encode cookie value', () => {
      setCookie('test', 'value with spaces')
      
      expect(document.cookie).toContain('test=')
    })

    it('should set multiple cookies', () => {
      setCookie('cookie1', 'value1')
      setCookie('cookie2', 'value2')
      
      expect(document.cookie).toContain('cookie1=value1')
      expect(document.cookie).toContain('cookie2=value2')
    })

    it('should overwrite existing cookie', () => {
      setCookie('test', 'old')
      setCookie('test', 'new')
      
      const value = getCookie('test')
      expect(value).toBe('new')
    })
  })

  describe('getCookie', () => {
    beforeEach(() => {
      // Clear all cookies
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`)
      })
    })

    it('should get an existing cookie', () => {
      document.cookie = 'test=value; path=/'
      
      const result = getCookie('test')
      expect(result).toBe('value')
    })

    it('should return null for non-existent cookie', () => {
      const result = getCookie('nonexistent')
      expect(result).toBeNull()
    })

    it('should handle multiple cookies', () => {
      document.cookie = 'cookie1=value1; path=/'
      document.cookie = 'cookie2=value2; path=/'
      
      expect(getCookie('cookie1')).toBe('value1')
      expect(getCookie('cookie2')).toBe('value2')
    })

    it('should handle cookies with similar names', () => {
      document.cookie = 'test=value1; path=/'
      document.cookie = 'test_other=value2; path=/'
      
      expect(getCookie('test')).toBe('value1')
      expect(getCookie('test_other')).toBe('value2')
    })

    it('should return first matching cookie value', () => {
      setCookie('test', 'value')
      
      const result = getCookie('test')
      expect(result).toBe('value')
    })

    it('should handle empty cookie value', () => {
      document.cookie = 'test=; path=/'
      
      const result = getCookie('test')
      expect(result).toBe(null) // getCookie returns null for empty values
    })
  })

  describe('cookie integration', () => {
    beforeEach(() => {
      // Clear all cookies
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`)
      })
    })

    it('should set and get cookie correctly', () => {
      setCookie('integration', 'test-value')
      const result = getCookie('integration')
      
      expect(result).toBe('test-value')
    })

    it('should handle complex values', () => {
      const complexValue = 'value-with-dashes_and_underscores'
      setCookie('complex', complexValue)
      const result = getCookie('complex')
      
      expect(result).toBe(complexValue)
    })

    it('should update cookie value', () => {
      setCookie('update', 'initial')
      expect(getCookie('update')).toBe('initial')
      
      setCookie('update', 'updated')
      expect(getCookie('update')).toBe('updated')
    })
  })
})
