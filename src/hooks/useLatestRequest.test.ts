import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLatestRequest } from './useLatestRequest'

describe('useLatestRequest', () => {
  it('only reports the most recently started request as latest', () => {
    const { result } = renderHook(() => useLatestRequest())

    const first = result.current()
    expect(first()).toBe(true)

    const second = result.current()
    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })

  it('returns a stable starter across renders so it is safe in effect dependencies', () => {
    const { result, rerender } = renderHook(() => useLatestRequest())
    const starter = result.current

    rerender()

    expect(result.current).toBe(starter)
  })
})
