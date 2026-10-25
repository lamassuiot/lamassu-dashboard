import { v7 as uuidv7 } from 'uuid';

/**
 * Generates a UUID v7 (RFC 9562). IDs generated in the same millisecond keep creation order.
 */
export function generateUUID(): string {
  return uuidv7();
}
