import { describe, it, expect } from 'vitest'
import { initPkijsEngine } from '@/lib-crypto'

describe('engine', () => {
  it('should not throw when initializing the PKI.js engine', () => {
    expect(() => initPkijsEngine()).not.toThrow()
  })
})
