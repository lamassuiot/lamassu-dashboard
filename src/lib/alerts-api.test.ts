import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import {
  fetchLatestAlerts,
  fetchSystemSubscriptions,
  subscribeToAlert,
  updateSubscription,
  unsubscribeFromAlert,
  type ApiAlertEvent,
  type ApiSubscription,
  type SubscriptionPayload,
} from './alerts-api'

const MOCK_TOKEN = 'test-access-token'
const ALERTS_API_BASE = 'https://api.test.lamassu.io/alerts/v1'

describe('alerts-api', () => {
  describe('fetchLatestAlerts', () => {
    it('should fetch latest alerts successfully', async () => {
      const mockAlerts: ApiAlertEvent[] = [
        {
          event_types: 'certificate.expired',
          event: {
            specversion: '1.0',
            id: 'alert-1',
            source: 'ca-service',
            type: 'certificate.expired',
            datacontenttype: 'application/json',
            time: '2024-12-01T00:00:00Z',
            data: { cert_id: 'cert-123' },
          },
          seen_at: '2024-12-01T00:00:00Z',
          counter: 1,
        },
      ]

      server.use(
        http.get(`${ALERTS_API_BASE}/events/latest`, () => {
          return HttpResponse.json(mockAlerts)
        })
      )

      const result = await fetchLatestAlerts(MOCK_TOKEN)

      expect(result).toEqual(mockAlerts)
      expect(result).toHaveLength(1)
      expect(result[0].event_types).toBe('certificate.expired')
    })

    it('should handle fetch alerts error', async () => {
      server.use(
        http.get(`${ALERTS_API_BASE}/events/latest`, () => {
          return HttpResponse.json(
            { message: 'Unauthorized access' },
            { status: 401 }
          )
        })
      )

      await expect(fetchLatestAlerts(MOCK_TOKEN)).rejects.toThrow(
        'Failed to fetch alerts'
      )
    })

    it('should handle network errors', async () => {
      server.use(
        http.get(`${ALERTS_API_BASE}/events/latest`, () => {
          return HttpResponse.error()
        })
      )

      await expect(fetchLatestAlerts(MOCK_TOKEN)).rejects.toThrow()
    })

    it('should include authorization header', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get(`${ALERTS_API_BASE}/events/latest`, ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.json([])
        })
      )

      await fetchLatestAlerts(MOCK_TOKEN)

      expect(capturedHeaders?.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`)
    })
  })

  describe('fetchSystemSubscriptions', () => {
    it('should fetch alert subscriptions successfully', async () => {
      const mockSubscriptions: ApiSubscription[] = [
        {
          id: 'sub-1',
          user_id: 'user-123',
          event_type: 'certificate.expired',
          subscription_ts: '2024-12-01T00:00:00Z',
          conditions: [{ type: 'ca_id', condition: 'ca-123' }],
          channel: {
            type: 'EMAIL',
            name: 'Email Alert',
            config: { email: 'test@example.com' },
          },
        },
      ]

      server.use(
        http.get(`${ALERTS_API_BASE}/user/_lms_system/subscriptions`, () => {
          return HttpResponse.json(mockSubscriptions)
        })
      )

      const result = await fetchSystemSubscriptions(MOCK_TOKEN)

      expect(result).toEqual(mockSubscriptions)
      expect(result).toHaveLength(1)
      expect(result[0].channel.type).toBe('EMAIL')
    })

    it('should handle fetch subscriptions error', async () => {
      server.use(
        http.get(`${ALERTS_API_BASE}/user/_lms_system/subscriptions`, () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      await expect(fetchSystemSubscriptions(MOCK_TOKEN)).rejects.toThrow(
        'Failed to fetch subscriptions'
      )
    })
  })

  describe('subscribeToAlert', () => {
    const mockPayload: SubscriptionPayload = {
      event_type: 'certificate.expired',
      conditions: [{ type: 'ca_id', condition: 'ca-123' }],
      channel: {
        type: 'EMAIL',
        name: 'Email Alert',
        config: { email: 'test@example.com' },
      },
    }

    it('should create alert subscription successfully', async () => {
      const mockResponse = { id: 'sub-new' }

      server.use(
        http.post(`${ALERTS_API_BASE}/user/_lms_system/subscribe`, () => {
          return HttpResponse.json(mockResponse, { status: 201 })
        })
      )

      await expect(
        subscribeToAlert(mockPayload, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should send correct payload', async () => {
      let capturedBody: any

      server.use(
        http.post(`${ALERTS_API_BASE}/user/_lms_system/subscribe`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ id: 'sub-new' }, { status: 201 })
        })
      )

      await subscribeToAlert(mockPayload, MOCK_TOKEN)

      expect(capturedBody).toEqual(mockPayload)
    })

    it('should handle create subscription error', async () => {
      server.use(
        http.post(`${ALERTS_API_BASE}/user/_lms_system/subscribe`, () => {
          return HttpResponse.json(
            { err: 'Invalid payload' },
            { status: 400 }
          )
        })
      )

      await expect(
        subscribeToAlert(mockPayload, MOCK_TOKEN)
      ).rejects.toThrow('Subscription failed')
    })
  })

  describe('updateSubscription', () => {
    const subscriptionId = 'sub-123'
    const mockPayload: SubscriptionPayload = {
      event_type: 'certificate.revoked',
      conditions: [],
      channel: {
        type: 'WEBHOOK',
        name: 'Webhook Alert',
        config: { url: 'https://example.com/webhook', method: 'POST' },
      },
    }

    it('should update alert subscription successfully', async () => {
      server.use(
        http.put(`${ALERTS_API_BASE}/user/_lms_system/subscriptions/${subscriptionId}`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        updateSubscription(subscriptionId, mockPayload, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should handle update subscription error', async () => {
      server.use(
        http.put(`${ALERTS_API_BASE}/user/_lms_system/subscriptions/${subscriptionId}`, () => {
          return new HttpResponse(null, { status: 404 })
        })
      )

      await expect(
        updateSubscription(subscriptionId, mockPayload, MOCK_TOKEN)
      ).rejects.toThrow('Failed to update subscription')
    })
  })

  describe('unsubscribeFromAlert', () => {
    const subscriptionId = 'sub-123'

    it('should delete alert subscription successfully', async () => {
      server.use(
        http.post(`${ALERTS_API_BASE}/user/_lms_system/unsubscribe/${subscriptionId}`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        unsubscribeFromAlert(subscriptionId, MOCK_TOKEN)
      ).resolves.toBeUndefined()
    })

    it('should handle delete subscription error', async () => {
      server.use(
        http.post(`${ALERTS_API_BASE}/user/_lms_system/unsubscribe/${subscriptionId}`, () => {
          return new HttpResponse(null, { status: 404 })
        })
      )

      await expect(
        unsubscribeFromAlert(subscriptionId, MOCK_TOKEN)
      ).rejects.toThrow('Failed to unsubscribe')
    })
  })
})
