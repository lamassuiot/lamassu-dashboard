import { describe, expect, it } from 'vitest'
import { parseKeyOrigin } from './key-origin'

describe('parseKeyOrigin', () => {
  it.each(['LOCAL', 'IMPORTED', 'UNKNOWN'] as const)('keeps %s', (origin) => {
    expect(parseKeyOrigin(origin)).toBe(origin)
  })

  it('is case-insensitive', () => {
    expect(parseKeyOrigin('local')).toBe('LOCAL')
    expect(parseKeyOrigin(' Imported ')).toBe('IMPORTED')
  })

  it.each([undefined, null, '', 'MANAGED', 42])('treats %s as no key in the KMS', (value) => {
    expect(parseKeyOrigin(value)).toBeUndefined()
  })
})
