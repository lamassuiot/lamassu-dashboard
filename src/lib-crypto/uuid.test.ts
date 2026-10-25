import { describe, expect, it } from 'vitest'

import { generateUUID } from './uuid'

describe('generateUUID', () => {
  it('returns a UUID v7', () => {
    expect(generateUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('embeds the current millisecond timestamp', () => {
    const before = Date.now()
    const ts = parseInt(generateUUID().replace(/-/g, '').slice(0, 12), 16)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(Date.now())
  })
})
