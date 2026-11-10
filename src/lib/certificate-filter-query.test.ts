import { describe, expect, it } from 'vitest'
import { appendCertificateQueryFilters } from './certificate-filter-query'

const filtersFor = (keyOriginFilters: ('LOCAL' | 'IMPORTED' | 'UNKNOWN')[]) => {
  const params = new URLSearchParams()
  appendCertificateQueryFilters(params, { searchTerm: '', searchField: 'commonName', keyOriginFilters })
  return params.getAll('filter')
}

describe('appendCertificateQueryFilters key origin', () => {
  it('adds no filter when no origin is selected', () => {
    expect(filtersFor([])).toEqual([])
  })

  it('uses equal for one origin and in for several', () => {
    expect(filtersFor(['LOCAL'])).toEqual(['key_origin[equal]LOCAL'])
    expect(filtersFor(['IMPORTED', 'UNKNOWN'])).toEqual(['key_origin[in]IMPORTED,UNKNOWN'])
  })
})
