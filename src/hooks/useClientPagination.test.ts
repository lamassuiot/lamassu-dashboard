import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useClientPagination } from './useClientPagination'

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('useClientPagination', () => {
  it('shows the first page of five by default and steps through the rest', () => {
    const { result } = renderHook(() => useClientPagination(rows(12)))
    expect(result.current.pageItems).toEqual([1, 2, 3, 4, 5])
    expect(result.current.rangeLabel).toBe('1–5 of 12')
    expect(result.current.canGoPrevious).toBe(false)

    act(() => result.current.goNext())
    act(() => result.current.goNext())
    expect(result.current.pageItems).toEqual([11, 12])
    expect(result.current.rangeLabel).toBe('11–12 of 12')
    expect(result.current.canGoNext).toBe(false)

    act(() => result.current.goNext())
    expect(result.current.pageIndex).toBe(2)
  })

  it('goes back to the first page when the query changes', () => {
    const { result, rerender } = renderHook(({ key }) => useClientPagination(rows(12), { resetKey: key }), { initialProps: { key: 'a' } })
    act(() => result.current.goNext())
    expect(result.current.pageIndex).toBe(1)
    rerender({ key: 'b' })
    expect(result.current.pageIndex).toBe(0)
  })

  it('stays on a page that still exists when the list shrinks', () => {
    const { result, rerender } = renderHook(({ items }) => useClientPagination(items), { initialProps: { items: rows(12) } })
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    rerender({ items: rows(7) })
    expect(result.current.pageIndex).toBe(1)
    expect(result.current.pageItems).toEqual([6, 7])
  })

  it('restarts from the first page when the page size changes', () => {
    const { result } = renderHook(() => useClientPagination(rows(30)))
    act(() => result.current.goNext())
    act(() => result.current.setPageSize('10'))
    expect(result.current.pageIndex).toBe(0)
    expect(result.current.pageItems).toHaveLength(10)
  })

  it('handles an empty list', () => {
    const { result } = renderHook(() => useClientPagination([]))
    expect(result.current.pageItems).toEqual([])
    expect(result.current.rangeLabel).toBe('0 of 0')
    expect(result.current.canGoNext).toBe(false)
  })
})
