/**
 * LocalStorage utilities for managing saved JSONPath metadata filter queries
 */

export interface MetadataFilterQuery {
  id: string;
  name: string;
  description?: string;
  jsonPath: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'lamassu_metadata_filters';

/**
 * Get all saved metadata filter queries from localStorage
 */
export function getSavedMetadataFilters(): MetadataFilterQuery[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to load saved metadata filters:', error);
    return [];
  }
}

/**
 * Save a new metadata filter query to localStorage
 */
export function saveMetadataFilter(
  name: string,
  jsonPath: string,
  description?: string
): MetadataFilterQuery {
  const filters = getSavedMetadataFilters();
  
  const newFilter: MetadataFilterQuery = {
    id: `filter_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name,
    description,
    jsonPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  filters.push(newFilter);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  
  return newFilter;
}

/**
 * Update an existing metadata filter query
 */
export function updateMetadataFilter(
  id: string,
  updates: Partial<Pick<MetadataFilterQuery, 'name' | 'description' | 'jsonPath'>>
): MetadataFilterQuery | null {
  const filters = getSavedMetadataFilters();
  const index = filters.findIndex(f => f.id === id);
  
  if (index === -1) return null;
  
  filters[index] = {
    ...filters[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  
  return filters[index];
}

/**
 * Delete a metadata filter query from localStorage
 */
export function deleteMetadataFilter(id: string): boolean {
  const filters = getSavedMetadataFilters();
  const filteredList = filters.filter(f => f.id !== id);
  
  if (filteredList.length === filters.length) return false;
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredList));
  return true;
}

/**
 * Get a single metadata filter by ID
 */
export function getMetadataFilterById(id: string): MetadataFilterQuery | null {
  const filters = getSavedMetadataFilters();
  return filters.find(f => f.id === id) || null;
}
