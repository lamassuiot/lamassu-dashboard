import { describe, it, expect } from 'vitest'
import { arrayBufferToBase64, formatAsPem, ipToBuffer } from '@/lib-crypto'

describe('buffer-utils', () => {
  it('should convert IPv4 to ArrayBuffer', () => {
    const buf = ipToBuffer('127.0.0.1')
    expect(buf).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(buf!)).toEqual(new Uint8Array([127, 0, 0, 1]))
  })

  it('should return null for invalid IP addresses', () => {
    expect(ipToBuffer('not-an-ip')).toBeNull()
    expect(ipToBuffer('256.0.0.1')).toBeNull()
    expect(ipToBuffer('1.2.3')).toBeNull()
  })

  it('should convert IPv6 to ArrayBuffer when fully expanded', () => {
    const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
    const buf = ipToBuffer(ipv6)
    expect(buf).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(buf!).length).toBe(16)
    // A few spot checks (offsets based on 2-byte groups)
    const view = new Uint8Array(buf!)
    expect(view[0]).toBe(0x20)
    expect(view[1]).toBe(0x01)
    // Group 5 (0x8a2e) starts at byte index 10
    expect(view[10]).toBe(0x8a)
    expect(view[15]).toBe(0x34)
  })

  it('should encode ArrayBuffer to base64', () => {
    const bytes = new Uint8Array([0x74, 0x65, 0x73, 0x74]) // "test"
    const b64 = arrayBufferToBase64(bytes.buffer)
    expect(b64).toBe('dGVzdA==')
  })

  it('should format base64 as PEM with appropriate headers', () => {
    const pem = formatAsPem('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'CERTIFICATE')
    expect(pem).toContain('-----BEGIN CERTIFICATE-----')
    expect(pem).toContain('-----END CERTIFICATE-----')
    expect(pem).toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  })
})
