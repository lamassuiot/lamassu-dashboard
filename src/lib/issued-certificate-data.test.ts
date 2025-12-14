import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import {
  fetchIssuedCertificates,
  findCertificateBySerialNumber,
  type ApiIssuedCertificateListResponse,
  type ApiIssuedCertificateItem,
} from './issued-certificate-data'
import type { CertificateData } from '@/types/certificate'
import * as caData from './ca-data'

const MOCK_TOKEN = 'test-access-token'
const CA_API_BASE = 'https://api.test.lamassu.io/ca/v1'

// Valid X.509 certificate for testing (self-signed RSA 2048-bit certificate)
// Subject: CN=example.com, O=Example Org, C=US
// Issuer: CN=Example CA, O=Example Org
// Valid from Dec 1, 2024 to Dec 1, 2025
const VALID_TEST_CERTIFICATE_PEM = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAPdLg5cVRn2DMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAlVTMRMwEQYDVQQKDApFeGFtcGxlIE9yZzEhMB8GA1UEAwwYRXhhbXBsZSBD
QSBJbnRlcm1lZGlhdGUwHhcNMjQxMjAxMDAwMDAwWhcNMjUxMjAxMjM1OTU5WjA7
MQswCQYDVQQGEwJVUzETMBEGA1UECgwKRXhhbXBsZSBPcmcxFzAVBgNVBAMMDmV4
YW1wbGUuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfV
LPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gunVTLw7onFMwB2GmFiSJvXRPmJ
4v8JKo0Ukquw6hKEJqmwJk5zPnxlxNkRr5QV7MmqXq8iZiXAWY5HKCcFa5s6V0BK
SBPXPqE8ZfN0q2dFUKhKdRxL9Qnz9dDBVxSjCaCfE8tGMHMGxn/7fG2mHVB8lEJ5
aZYCJ6b7oJgD/zt5I4A3fV8MRJJ5lz+Q7aAv9SJRRqpPnqGqSwEZ8qC0xTTxBJdX
R7kJkVpFG/T6eV4xQjqYQU9bKQdGHqoH9eMLHKhEV9T3mTqBP6kpx7dDPZSCWJWF
LH3FpRPdUQIDAQABo1AwTjAdBgNVHQ4EFgQU3tHZzPPLR4Ry+8c9Q9r5VGO4QWAW
HwYDVR0jBBgwFoAU3tHZzPPLR4Ry+8c9Q9r5VGO4QWAwDAYDVR0TAQH/BAIwADAN
BgkqhkiG9w0BAQsFAAOCAQEAd4kCVGCmxK3NZ8d6sJTLHK8wJkW7QxU7J8yDFf3n
W9KULqP3xO4Qs9YLM8v8qMDnHqS3T5xJBzN8RmP4KlMtQzGxDfVLbHqKY9vW6R8k
lQtFJz9XHnKGGqPZ8YlRwVQMnKTfGH3JqSNmQ8kZBxRtY7vLQxKPnGmF4JRzBxTp
KlMQnS7yZJvXHqGP9YLmKtRzWQxJGHpZRqSFz3kPBxN7L8QyMnRtGPxKZvQ9JqTK
pLQxZRnXGPzVmHKLY9vW7R8klQtFJz9XHnKGGqPZ8YlRwVQMnKTfGH3JqSNmQ8kZ
BxRtY7vLQxKPnGmF4JRzBxTpKlMQnS7yZJvXHqGP9YLmKtRzWQxJGHpZRqSFz3kP
Bw==
-----END CERTIFICATE-----`

describe('issued-certificate-data', () => {
  // Mock parseCertificatePemDetails to avoid browser crypto dependencies in tests
  beforeEach(() => {
    vi.spyOn(caData, 'parseCertificatePemDetails').mockResolvedValue({
      subject: 'CN=example.com, O=Example Org, C=US',
      issuer: 'CN=Example CA, O=Example Org',
      serialNumber: 'F7:4B:83:97:15:46:7D:83',
      validFrom: '2024-12-01T00:00:00.000Z',
      validTo: '2025-12-01T23:59:59.000Z',
      publicKeyAlgorithm: 'RSA (2048 bit)',
      signatureAlgorithm: 'SHA256withRSA',
      crlDistributionPoints: [],
      ocspUrls: ['http://ocsp.example.com'],
      caIssuersUrls: [],
      isCa: false,
      pathLenConstraint: undefined,
      sans: ['example.com', 'www.example.com'],
      keyUsage: ['digitalSignature', 'keyEncipherment'],
      extendedKeyUsage: ['serverAuth', 'clientAuth'],
      subjectKeyId: 'DE:D1:D9:CC:F3:CB:47:84:72:FB:C7:3D:43:DA:F9:54:63:B8:41:60',
      authorityKeyId: 'DE:D1:D9:CC:F3:CB:47:84:72:FB:C7:3D:43:DA:F9:54:63:B8:41:60',
      fingerprintSha256: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
    })
  })

  const mockCertificate: ApiIssuedCertificateItem = {
    serial_number: '123456',
    subject_key_id: 'subject-key-1',
    authority_key_id: 'auth-key-1',
    metadata: {},
    status: 'active',
    certificate: Buffer.from(VALID_TEST_CERTIFICATE_PEM).toString('base64'),
    key_metadata: {
      type: 'RSA',
      bits: 2048,
    },
    subject: {
      common_name: 'example.com',
      organization: 'Example Org',
      country: 'US',
    },
    issuer: {
      common_name: 'Example CA',
      organization: 'Example Org',
    },
    valid_from: '2024-12-01T00:00:00Z',
    valid_to: '2025-12-01T00:00:00Z',
    issuer_metadata: {
      serial_number: '1',
      id: 'ca-1',
      level: 0,
    },
    is_ca: false,
  }

  describe('fetchIssuedCertificates', () => {
    const caId = 'ca-123'

    it('should fetch issued certificates successfully', async () => {
      const mockResponse: ApiIssuedCertificateListResponse = {
        next: null,
        list: [mockCertificate],
      }

      server.use(
        http.get(`${CA_API_BASE}/cas/${caId}/certificates`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await fetchIssuedCertificates({
        forCaId: caId,
        accessToken: MOCK_TOKEN,
        apiQueryString: '',
      })

      expect(result).toBeDefined()
      expect(result.certificates).toHaveLength(1)
      expect(result.certificates[0].serialNumber).toBe('123456')
    })

    it('should handle query parameters', async () => {
      let capturedUrl: URL | undefined

      server.use(
        http.get(`${CA_API_BASE}/cas/${caId}/certificates`, ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({ next: null, list: [] })
        })
      )

      await fetchIssuedCertificates({
        forCaId: caId,
        accessToken: MOCK_TOKEN,
        apiQueryString: 'status=active&limit=10',
      })

      expect(capturedUrl?.searchParams.get('status')).toBe('active')
      expect(capturedUrl?.searchParams.get('limit')).toBe('10')
    })

    it('should handle pagination', async () => {
      const mockResponse: ApiIssuedCertificateListResponse = {
        next: 'next-page-token',
        list: [mockCertificate],
      }

      server.use(
        http.get(`${CA_API_BASE}/cas/${caId}/certificates`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await fetchIssuedCertificates({
        forCaId: caId,
        accessToken: MOCK_TOKEN,
        apiQueryString: '',
      })

      expect(result.nextToken).toBe('next-page-token')
    })

    it('should handle fetch error', async () => {
      server.use(
        http.get(`${CA_API_BASE}/cas/${caId}/certificates`, () => {
          return HttpResponse.json(
            { err: 'CA not found' },
            { status: 404 }
          )
        })
      )

      await expect(
        fetchIssuedCertificates({
          forCaId: caId,
          accessToken: MOCK_TOKEN,
          apiQueryString: '',
        })
      ).rejects.toThrow('Failed to fetch issued certificates')
    })

    it('should transform API response to local format', async () => {
      const mockResponse: ApiIssuedCertificateListResponse = {
        next: null,
        list: [mockCertificate],
      }

      server.use(
        http.get(`${CA_API_BASE}/cas/${caId}/certificates`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await fetchIssuedCertificates({
        forCaId: caId,
        accessToken: MOCK_TOKEN,
        apiQueryString: '',
      })

      expect(result.certificates[0]).toHaveProperty('subject')
      expect(result.certificates[0]).toHaveProperty('issuer')
      expect(result.certificates[0]).toHaveProperty('publicKeyAlgorithm')
      expect(result.certificates[0].publicKeyAlgorithm).toContain('RSA')
      expect(result.certificates[0].publicKeyAlgorithm).toContain('2048')
    })
  })

  describe('findCertificateBySerialNumber', () => {
    it('should find certificate by serial number', () => {
      const certs: CertificateData[] = [
        {
          serialNumber: '123456',
          subject: 'CN=test.example.com',
          issuer: 'CN=Test CA',
          validFrom: '2024-01-01T00:00:00Z',
          validTo: '2025-01-01T00:00:00Z',
          status: 'active',
          pem: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
          id: '123456',
          publicKeyAlgorithm: 'RSA 2048',
        },
        {
          serialNumber: '654321',
          subject: 'CN=another.example.com',
          issuer: 'CN=Test CA',
          validFrom: '2024-01-01T00:00:00Z',
          validTo: '2025-01-01T00:00:00Z',
          status: 'active',
          pem: '-----BEGIN CERTIFICATE-----\ntest2\n-----END CERTIFICATE-----',
          id: '654321',
          publicKeyAlgorithm: 'RSA 2048',
        },
      ]

      const result = findCertificateBySerialNumber('123456', certs)

      expect(result).toBeDefined()
      expect(result?.serialNumber).toBe('123456')
      expect(result?.subject).toContain('test.example.com')
    })

    it('should return null if certificate not found', () => {
      const certs: CertificateData[] = []

      const result = findCertificateBySerialNumber('nonexistent', certs)

      expect(result).toBeNull()
    })
  })
})
