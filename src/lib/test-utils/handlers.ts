import { http, HttpResponse } from 'msw'

const API_BASE = 'https://api.test.lamassu.io'
const CA_API_BASE = 'https://ca-api.test.lamassu.io'
const DMS_API_BASE = 'https://dms-api.test.lamassu.io'
const DEVICES_API_BASE = 'https://devices-api.test.lamassu.io'
const ALERTS_API_BASE = 'https://alerts-api.test.lamassu.io'
const VA_API_BASE = 'https://va-api.test.lamassu.io'

export const handlers = [
  // CA API handlers
  http.get(`${CA_API_BASE}/v1/cas`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${CA_API_BASE}/v1/cas/:id`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Test CA',
      certificate: {
        status: 'active',
      },
    })
  }),

  // DMS/RA API handlers
  http.get(`${DMS_API_BASE}/v1/cas`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${DMS_API_BASE}/v1/cas/:id`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Test RA',
    })
  }),

  // Devices API handlers
  http.get(`${DEVICES_API_BASE}/v1/devices`, () => {
    return HttpResponse.json({
      devices: [],
      total_devices: 0,
    })
  }),

  http.get(`${DEVICES_API_BASE}/v1/devices/:id`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      alias: 'test-device',
      status: 'active',
    })
  }),

  // Alerts API handlers
  http.get(`${ALERTS_API_BASE}/v1/events`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${ALERTS_API_BASE}/v1/subscriptions`, () => {
    return HttpResponse.json([])
  }),

  // VA API handlers
  http.get(`${VA_API_BASE}/v1/cas/:id`, ({ params }) => {
    return HttpResponse.json({
      ca_id: params.id,
      ocsp_url: 'http://ocsp.example.com',
      crl_url: 'http://crl.example.com',
    })
  }),

  // EST API handlers
  http.get(`${DMS_API_BASE}/v1/cas/:id/.well-known/est/:ra_id/cacerts`, () => {
    return HttpResponse.text('-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----')
  }),

  // VA Core API handlers  
  http.get('https://api.test.lamassu.io/va/crl/:ski', () => {
    return HttpResponse.arrayBuffer(new ArrayBuffer(100))
  }),

  // Certificate API handlers
  http.get('https://api.test.lamassu.io/ca/v1/certificates', () => {
    return HttpResponse.json({ next: null, list: [] })
  }),

  // Device stats endpoint
  http.get('https://api.test.lamassu.io/devmanager/v1/stats', () => {
    return HttpResponse.json({ total: 0, pending: 0, active: 0, decommissioned: 0 })
  }),
]
