import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateUUID } from './uuid'

const timestampOf = (uuid: string) => parseInt(uuid.replace(/-/g, '').slice(0, 12), 16)

describe('generateUUID', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a UUID v7', () => {
    expect(generateUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('embeds the current millisecond timestamp', () => {
    const before = Date.now()
    const ts = timestampOf(generateUUID())
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(Date.now())
  })

  it('keeps creation order within the same millisecond, including counter overflow', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)

    const ids = Array.from({ length: 5000 }, () => generateUUID())

    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps creation order when the clock goes backwards', () => {
    const now = Date.now() + 120_000
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now)
    const first = generateUUID()

    spy.mockReturnValue(now - 5_000)
    const second = generateUUID()

    expect(second > first).toBe(true)
    expect(timestampOf(second)).toBe(now)
  })
})
