import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import { fetchEstCaCerts } from './est-api'

const EST_API_BASE = 'https://api.test.lamassu.io/dmsmanager/.well-known/est'

describe('est-api', () => {
  describe('fetchEstCaCerts', () => {
    const raId = 'ra-123'

    describe('PKCS#7 format', () => {
      it('should fetch CA certs in PKCS#7 format', async () => {
        const mockData = new ArrayBuffer(100)

        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return HttpResponse.arrayBuffer(mockData, {
              headers: { 'Content-Type': 'application/pkcs7-mime' },
            })
          })
        )

        const result = await fetchEstCaCerts(raId, 'pkcs7-mime')

        expect(result.data).toBeInstanceOf(ArrayBuffer)
        expect(result.contentType).toBe('application/pkcs7-mime')
      })

      it('should send correct Accept header for PKCS#7', async () => {
        let capturedHeaders: Headers | undefined

        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, ({ request }) => {
            capturedHeaders = request.headers
            return HttpResponse.arrayBuffer(new ArrayBuffer(100))
          })
        )

        await fetchEstCaCerts(raId, 'pkcs7-mime')

        expect(capturedHeaders?.get('Accept')).toBe('application/pkcs7-mime')
      })

      it('should not send Authorization header when no token provided', async () => {
        let capturedHeaders: Headers | undefined

        window.localStorage.clear()

        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, ({ request }) => {
            capturedHeaders = request.headers
            return HttpResponse.arrayBuffer(new ArrayBuffer(100))
          })
        )

        await fetchEstCaCerts(raId, 'pkcs7-mime')

        expect(capturedHeaders?.has('Authorization')).toBe(false)
      })

      it('should send Authorization header when token is in storage', async () => {
        let capturedHeaders: Headers | undefined

        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, ({ request }) => {
            capturedHeaders = request.headers
            return HttpResponse.arrayBuffer(new ArrayBuffer(100))
          })
        )

        await fetchEstCaCerts(raId, 'pkcs7-mime')

        expect(capturedHeaders?.get('Authorization')).toBe('Bearer test-access-token')
      })
    })

    describe('PEM format', () => {
      it('should fetch CA certs in PEM format', async () => {
        const mockPem = `-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUBPZKHcZJMjKnD9FMqQKmL9gCJCYwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCVVMxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNDEyMDEwMDAwMDBaFw0yNTEy
-----END CERTIFICATE-----`

        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return HttpResponse.text(mockPem, {
              headers: { 'Content-Type': 'application/x-pem-file' },
            })
          })
        )

        const result = await fetchEstCaCerts(raId, 'x-pem-file')

        expect(typeof result.data).toBe('string')
        expect(result.data).toContain('BEGIN CERTIFICATE')
        expect(result.contentType).toBe('application/x-pem-file')
      })

      it('should send correct Accept header for PEM', async () => {
        let capturedHeaders: Headers | undefined

        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, ({ request }) => {
            capturedHeaders = request.headers
            return HttpResponse.text('-----BEGIN CERTIFICATE-----')
          })
        )

        await fetchEstCaCerts(raId, 'x-pem-file')

        expect(capturedHeaders?.get('Accept')).toBe('application/x-pem-file')
      })

      it('should include authorization for authenticated PEM requests', async () => {
        let capturedHeaders: Headers | undefined

        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, ({ request }) => {
            capturedHeaders = request.headers
            return HttpResponse.text('-----BEGIN CERTIFICATE-----')
          })
        )

        await fetchEstCaCerts(raId, 'x-pem-file')

        expect(capturedHeaders?.get('Authorization')).toBe('Bearer test-access-token')
      })
    })

    describe('error handling', () => {
      it('should handle 404 error', async () => {
        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return new HttpResponse(null, { status: 404 })
          })
        )

        await expect(fetchEstCaCerts(raId, 'pkcs7-mime')).rejects.toThrow(
          'Failed to fetch EST CA certs'
        )
      })

      it('should handle 401 unauthorized error', async () => {
        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return HttpResponse.json(
              { err: 'Unauthorized' },
              { status: 401 }
            )
          })
        )

        await expect(fetchEstCaCerts(raId, 'x-pem-file')).rejects.toThrow(
          'EST CA certs fetch failed'
        )
      })

      it('should handle JSON error response', async () => {
        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return HttpResponse.json(
              { err: 'RA not found' },
              { status: 404 }
            )
          })
        )

        await expect(fetchEstCaCerts(raId, 'pkcs7-mime')).rejects.toThrow(
          'RA not found'
        )
      })

      it('should handle error with message field', async () => {
        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return HttpResponse.json(
              { message: 'Invalid RA ID format' },
              { status: 400 }
            )
          })
        )

        await expect(fetchEstCaCerts(raId, 'pkcs7-mime')).rejects.toThrow(
          'Invalid RA ID format'
        )
      })

      it('should handle non-JSON error response', async () => {
        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return HttpResponse.text('Internal Server Error', { status: 500 })
          })
        )

        await expect(fetchEstCaCerts(raId, 'pkcs7-mime')).rejects.toThrow(
          'Server responded with status 500'
        )
      })

      it('should handle network error', async () => {
        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return HttpResponse.error()
          })
        )

        await expect(fetchEstCaCerts(raId, 'pkcs7-mime')).rejects.toThrow()
      })
    })

    describe('content-type handling', () => {
      it('should use default content-type when header is missing for PKCS#7', async () => {
        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return new HttpResponse(new ArrayBuffer(100))
          })
        )

        const result = await fetchEstCaCerts(raId, 'pkcs7-mime')

        expect(result.contentType).toBe('application/pkcs7-mime')
      })

      it('should use default content-type when header is missing for PEM', async () => {
        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return HttpResponse.text('-----BEGIN CERTIFICATE-----')
          })
        )

        const result = await fetchEstCaCerts(raId, 'x-pem-file')

        expect(result.contentType).toBe('text/plain') // HttpResponse.text() defaults to text/plain
      })

      it('should use server-provided content-type when available', async () => {
        server.use(
          http.get(`${EST_API_BASE}/${raId}/cacerts`, () => {
            return HttpResponse.arrayBuffer(new ArrayBuffer(100), {
              headers: { 'Content-Type': 'application/custom-type' },
            })
          })
        )

        const result = await fetchEstCaCerts(raId, 'pkcs7-mime')

        expect(result.contentType).toBe('application/custom-type')
      })
    })

    describe('different RA IDs', () => {
      it('should handle various RA ID formats', async () => {
        const raIds = ['ra-1', 'ra_test_123', 'RA-UUID-12345']

        for (const id of raIds) {
          let capturedUrl: URL | undefined

          server.use(
            http.get(`${EST_API_BASE}/${id}/cacerts`, ({ request }) => {
              capturedUrl = new URL(request.url)
              return HttpResponse.arrayBuffer(new ArrayBuffer(100))
            })
          )

          await fetchEstCaCerts(id, 'pkcs7-mime')

          expect(capturedUrl?.pathname).toContain(`/${id}/cacerts`)
        }
      })
    })
  })
})
