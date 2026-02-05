/**
 * ID Generator Utilities
 */

/**
 * Generate a unique ID (UUID v4 style)
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a short ID (8 characters)
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Generate a numeric ID from timestamp + random
 */
export function generateNumericId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}
