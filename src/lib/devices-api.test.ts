import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './test-utils/msw-server'
import {
  fetchDevices,
  fetchDeviceById,
  decommissionDevice,
  registerDevice,
  fetchDeviceStats,
  mergeDeviceEvents,
  type ApiDeviceEventItem,
  type ApiDevice,
  type ApiResponse,
  type DeviceStats,
} from './devices-api'

const DEV_API_BASE = 'https://api.test.lamassu.io/devmanager/v1'

describe('devices-api', () => {
  describe('fetchDevices', () => {
    it('should fetch devices with query parameters', async () => {
      const mockResponse: ApiResponse = {
        next: null,
        list: [
          {
            id: 'device-1',
            tags: ['iot', 'sensor'],
            status: 'ACTIVE',
            icon: 'device',
            icon_color: '#000000',
            creation_timestamp: '2024-12-01T00:00:00Z',
            metadata: {},
            dms_owner: 'dms-1',
            identity: {
              status: 'active',
              active_version: 1,
              type: 'certificate',
              versions: { '1': 'cert-123' },
            },
            slots: {},
          },
        ],
      }

      server.use(
        http.get(`${DEV_API_BASE}/devices`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const params = new URLSearchParams({ limit: '10' })
      const result = await fetchDevices(params)

      expect(result).toEqual(mockResponse)
      expect(result.list).toHaveLength(1)
      expect(result.list[0].id).toBe('device-1')
    })

    it('should handle pagination', async () => {
      const mockResponse: ApiResponse = {
        next: 'next-page-token',
        list: [],
      }

      server.use(
        http.get(`${DEV_API_BASE}/devices`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const params = new URLSearchParams()
      const result = await fetchDevices(params)

      expect(result.next).toBe('next-page-token')
    })

    it('should handle fetch devices error', async () => {
      server.use(
        http.get(`${DEV_API_BASE}/devices`, () => {
          return HttpResponse.json(
            { err: 'Database error' },
            { status: 500 }
          )
        })
      )

      const params = new URLSearchParams()
      await expect(fetchDevices(params)).rejects.toThrow(
        'Failed to fetch devices'
      )
    })
  })

  describe('fetchDeviceById', () => {
    const deviceId = 'device-123'

    it('should fetch device by ID successfully', async () => {
      const mockDevice: ApiDevice = {
        id: deviceId,
        tags: ['production'],
        status: 'ACTIVE',
        icon: 'server',
        icon_color: '#00ff00',
        creation_timestamp: '2024-12-01T00:00:00Z',
        metadata: { location: 'datacenter-1' },
        dms_owner: 'dms-1',
        identity: null,
        slots: {},
      }

      server.use(
        http.get(`${DEV_API_BASE}/devices/${deviceId}`, () => {
          return HttpResponse.json(mockDevice)
        })
      )

      const result = await fetchDeviceById(deviceId)

      expect(result).toEqual(mockDevice)
      expect(result.id).toBe(deviceId)
    })

    it('should handle device not found', async () => {
      server.use(
        http.get(`${DEV_API_BASE}/devices/${deviceId}`, () => {
          return HttpResponse.json(
            { err: 'Device not found' },
            { status: 404 }
          )
        })
      )

      await expect(fetchDeviceById(deviceId)).rejects.toThrow(
        'Failed to fetch device details'
      )
    })
  })

  describe('decommissionDevice', () => {
    const deviceId = 'device-123'

    it('should decommission device successfully', async () => {
      server.use(
        http.delete(`${DEV_API_BASE}/devices/${deviceId}/decommission`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      await expect(
        decommissionDevice(deviceId)
      ).resolves.toBeUndefined()
    })

    it('should handle decommission error', async () => {
      server.use(
        http.delete(`${DEV_API_BASE}/devices/${deviceId}/decommission`, () => {
          return HttpResponse.json(
            { err: 'Device already decommissioned' },
            { status: 400 }
          )
        })
      )

      await expect(decommissionDevice(deviceId)).rejects.toThrow(
        'Failed to decommission device'
      )
    })
  })

  describe('registerDevice', () => {
    const payload = {
      id: 'new-device',
      tags: ['new'],
      icon: 'device',
      icon_color: '#ffffff',
      metadata: {},
      dms_owner: 'dms-1',
    }

    it('should register device successfully', async () => {
      server.use(
        http.post(`${DEV_API_BASE}/devices`, () => {
          return new HttpResponse(null, { status: 201 })
        })
      )

      await expect(registerDevice(payload)).resolves.toBeUndefined()
    })

    it('should send correct payload', async () => {
      let capturedBody: any

      server.use(
        http.post(`${DEV_API_BASE}/devices`, async ({ request }) => {
          capturedBody = await request.json()
          return new HttpResponse(null, { status: 201 })
        })
      )

      await registerDevice(payload)

      expect(capturedBody).toEqual(payload)
    })

    it('should handle registration error', async () => {
      server.use(
        http.post(`${DEV_API_BASE}/devices`, () => {
          return HttpResponse.json(
            { err: 'Device ID already exists' },
            { status: 409 }
          )
        })
      )

      await expect(registerDevice(payload)).rejects.toThrow(
        'Failed to register device'
      )
    })
  })

  describe('fetchDeviceStats', () => {
    it('should fetch device statistics successfully', async () => {
      const mockStats: DeviceStats = {
        total: 100,
        status_distribution: {
          ACTIVE: 80,
          DECOMMISSIONED: 5,
          EXPIRED: 3,
          EXPIRING_SOON: 7,
          NO_IDENTITY: 2,
          RENEWAL_PENDING: 2,
          REVOKED: 1,
        },
      }

      server.use(
        http.get(`${DEV_API_BASE}/stats`, () => {
          return HttpResponse.json(mockStats)
        })
      )

      const result = await fetchDeviceStats()

      expect(result).toEqual(mockStats)
      expect(result.total).toBe(100)
      expect(result.status_distribution.ACTIVE).toBe(80)
    })

    it('should handle stats fetch error', async () => {
      server.use(
        http.get(`${DEV_API_BASE}/stats`, () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      await expect(fetchDeviceStats()).rejects.toThrow(
        'Failed to fetch device stats'
      )
    })
  })

  describe('mergeDeviceEvents', () => {
    const ev = (id: string, ts: string, description = id): ApiDeviceEventItem => ({
      id,
      timestampStr: ts,
      type: 'T',
      description,
      source: 'test',
    })

    it('replaces items with the same id', () => {
      const current = [ev('a', '2024-01-01T00:00:00Z', 'old')]
      const incoming = [ev('a', '2024-01-01T00:00:00Z', 'new')]

      const result = mergeDeviceEvents(current, incoming)

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('new')
    })

    it('keeps older loaded items not in incoming', () => {
      const current = [ev('old', '2024-01-01T00:00:00Z')]
      const incoming = [ev('new', '2024-01-02T00:00:00Z')]

      const result = mergeDeviceEvents(current, incoming)

      expect(result.map((e) => e.id)).toEqual(['new', 'old'])
    })

    it('sorts newest first and caps at max', () => {
      const current = [
        ev('1', '2024-01-01T00:00:00Z'),
        ev('3', '2024-01-03T00:00:00Z'),
        ev('5', '2024-01-05T00:00:00Z'),
      ]
      const incoming = [ev('2', '2024-01-02T00:00:00Z'), ev('4', '2024-01-04T00:00:00Z')]

      const result = mergeDeviceEvents(current, incoming, 3)

      expect(result.map((e) => e.id)).toEqual(['5', '4', '3'])
    })

    it('collapses duplicates inside incoming', () => {
      const incoming = [
        ev('a', '2024-01-01T00:00:00Z', 'first'),
        ev('a', '2024-01-01T00:00:00Z', 'second'),
      ]

      const result = mergeDeviceEvents([], incoming)

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('second')
    })

    it('puts unparsable timestamps last, keeps order stable, and does not mutate inputs', () => {
      const current = [ev('bad1', 'nope'), ev('ok', '2024-01-01T00:00:00Z')]
      const incoming = [ev('bad2', 'nope')]
      const currentCopy = [...current]

      const result = mergeDeviceEvents(current, incoming)

      expect(result.map((e) => e.id)).toEqual(['ok', 'bad1', 'bad2'])
      expect(current).toEqual(currentCopy)
    })
  })
})
