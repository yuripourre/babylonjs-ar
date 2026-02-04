/**
 * ORB Sampling Pattern
 * Precomputed test point pairs for ORB descriptor
 */

export interface TestPair {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Get ORB test pattern (256 pairs)
 * These are optimized point pairs for binary tests
 * Pattern is centered at origin, radius ~15 pixels
 */
export function getORBPattern(): TestPair[] {
  // Simplified ORB pattern (normally loaded from precomputed data)
  // This uses a reasonable geometric distribution
  const pattern: TestPair[] = [];
  const numPairs = 256;
  const radius = 15;

  for (let i = 0; i < numPairs; i++) {
    // Distribute pairs in a starburst pattern
    const angle1 = (i / numPairs) * Math.PI * 2;
    const angle2 = angle1 + Math.PI + (Math.random() - 0.5) * 0.5;

    const r1 = radius * (0.3 + Math.random() * 0.7);
    const r2 = radius * (0.3 + Math.random() * 0.7);

    pattern.push({
      x1: Math.round(Math.cos(angle1) * r1),
      y1: Math.round(Math.sin(angle1) * r1),
      x2: Math.round(Math.cos(angle2) * r2),
      y2: Math.round(Math.sin(angle2) * r2),
    });
  }

  return pattern;
}

/**
 * Convert pattern to flat array for GPU upload
 */
export function patternToArray(pattern: TestPair[]): Int32Array {
  const array = new Int32Array(pattern.length * 4);

  for (let i = 0; i < pattern.length; i++) {
    array[i * 4 + 0] = pattern[i].x1;
    array[i * 4 + 1] = pattern[i].y1;
    array[i * 4 + 2] = pattern[i].x2;
    array[i * 4 + 3] = pattern[i].y2;
  }

  return array;
}
