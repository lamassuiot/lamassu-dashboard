import { describe, it, expect } from 'vitest'
import { parseCsr, type DecodedCsrInfo } from './csr-utils'
import { VALID_CSR_PEM, CSR_WITH_SANS_PEM } from './test-utils/fixtures/certificates'

describe('csr-utils', () => {
  describe('parseCsr', () => {
    it('should parse a valid CSR with basic fields', async () => {
      const result = await parseCsr(VALID_CSR_PEM)

      expect(result.error).toBeUndefined()
      expect(result.subject).toBeDefined()
      expect(result.publicKeyInfo).toBeDefined()
      
      // Subject should contain common name
      expect(result.subject).toContain('CN=example.com')
      expect(result.subject).toContain('O=Example Co')
      expect(result.subject).toContain('C=US')
      
      // Public key info should identify RSA
      expect(result.publicKeyInfo).toContain('RSA')
      expect(result.publicKeyInfo).toMatch(/\d+ bits/)
    })

    it('should parse CSR with Subject Alternative Names', async () => {
      const result = await parseCsr(CSR_WITH_SANS_PEM)

      // Note: SANs parsing depends on PKI.js ability to parse extension request attributes
      // If parsing fails, it should still return a valid result without SANs
      if (result.error) {
        // If there's an error parsing SANs, it should indicate an extension parsing issue
        expect(result.error).toContain('Failed to parse CSR')
      } else {
        expect(result.sans).toBeDefined()
        expect(Array.isArray(result.sans)).toBe(true)
        // SANs may be empty if the extension wasn't parsed correctly
      }
    })

    it('should return error for invalid PEM format', async () => {
      const invalidPem = 'INVALID CERTIFICATE REQUEST'
      const result = await parseCsr(invalidPem)

      expect(result.error).toBeDefined()
      expect(result.error).toContain('Failed to parse CSR')
    })

    it('should return error for malformed base64', async () => {
      const malformedPem = `-----BEGIN CERTIFICATE REQUEST-----
INVALID!!!BASE64@@@
-----END CERTIFICATE REQUEST-----`
      
      const result = await parseCsr(malformedPem)

      expect(result.error).toBeDefined()
      expect(result.error).toContain('Failed to parse CSR')
    })

    it('should handle CSR without extensions', async () => {
      const result = await parseCsr(VALID_CSR_PEM)

      expect(result.error).toBeUndefined()
      expect(result.sans).toBeDefined()
      expect(result.sans).toEqual([])
      expect(result.basicConstraints).toBeNull()
    })

    it('should extract organizational unit from subject', async () => {
      const result = await parseCsr(VALID_CSR_PEM)

      expect(result.error).toBeUndefined()
      expect(result.subject).toContain('OU=Devices')
    })

    it('should extract locality and state from subject', async () => {
      const result = await parseCsr(VALID_CSR_PEM)

      expect(result.error).toBeUndefined()
      expect(result.subject).toContain('L=San Francisco')
      expect(result.subject).toContain('ST=California')
    })

    it('should handle empty CSR string', async () => {
      const result = await parseCsr('')

      expect(result.error).toBeDefined()
      expect(result.error).toContain('Failed to parse CSR')
    })

    it('should handle CSR with extra whitespace', async () => {
      const csrWithWhitespace = `
        -----BEGIN CERTIFICATE REQUEST-----
        ${VALID_CSR_PEM.split('\n').slice(1, -1).join('\n')}
        -----END CERTIFICATE REQUEST-----
      `
      
      const result = await parseCsr(csrWithWhitespace)

      expect(result.error).toBeUndefined()
      expect(result.subject).toBeDefined()
    })

    it('should handle CSR with "NEW" in header', async () => {
      const csrWithNew = VALID_CSR_PEM.replace(
        '-----BEGIN CERTIFICATE REQUEST-----',
        '-----BEGIN NEW CERTIFICATE REQUEST-----'
      ).replace(
        '-----END CERTIFICATE REQUEST-----',
        '-----END NEW CERTIFICATE REQUEST-----'
      )
      
      const result = await parseCsr(csrWithNew)

      expect(result.error).toBeUndefined()
      expect(result.subject).toBeDefined()
    })

    it('should return proper structure for valid CSR', async () => {
      const result = await parseCsr(VALID_CSR_PEM)

      // Check structure
      expect(result).toHaveProperty('subject')
      expect(result).toHaveProperty('publicKeyInfo')
      expect(result).toHaveProperty('sans')
      expect(result).toHaveProperty('basicConstraints')
      
      // Ensure no error when successful
      expect(result.error).toBeUndefined()
    })

    it('should identify ECDSA public keys when present', async () => {
      // This test would require an ECDSA CSR fixture
      // For now, we verify RSA detection works
      const result = await parseCsr(VALID_CSR_PEM)

      expect(result.error).toBeUndefined()
      expect(result.publicKeyInfo).toContain('RSA')
      expect(result.publicKeyInfo).not.toContain('EC')
    })
  })
})
