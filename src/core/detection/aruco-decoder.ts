/**
 * ArUco Marker Decoder
 * Decodes ArUco marker IDs from extracted marker images
 */

export type DictionarySize = 4 | 5 | 6;

export interface MarkerBits {
  size: number;
  bits: number[]; // Flattened bit array
}

export interface DecodedMarker {
  id: number;
  rotation: 0 | 1 | 2 | 3; // 0, 90, 180, 270 degrees
  hamming: number; // Hamming distance (lower is better)
}

export class ArucoDecoder {
  private dictionary: Map<number, number[]>;
  private dictionarySize: number;

  constructor(dictionarySize: DictionarySize = 4) {
    this.dictionarySize = dictionarySize;
    this.dictionary = this.loadDictionary(dictionarySize);
  }

  /**
   * Extract bits from warped marker image
   */
  extractBits(imageData: Uint8Array, imageSize: number, markerSize: number): MarkerBits {
    const bits: number[] = [];
    const cellSize = imageSize / (markerSize + 2); // +2 for border

    // Skip border, read inner bits
    for (let y = 0; y < markerSize; y++) {
      for (let x = 0; x < markerSize; x++) {
        const centerX = Math.floor((x + 1.5) * cellSize);
        const centerY = Math.floor((y + 1.5) * cellSize);

        // Sample center of cell
        const idx = centerY * imageSize + centerX;
        const value = imageData[idx];

        bits.push(value > 127 ? 1 : 0);
      }
    }

    return { size: markerSize, bits };
  }

  /**
   * Decode marker ID and rotation
   */
  decode(markerBits: MarkerBits): DecodedMarker | null {
    if (markerBits.size !== this.dictionarySize) {
      return null;
    }

    let bestMatch: DecodedMarker | null = null;
    let bestDistance = Infinity;

    // Try all 4 rotations
    for (let rotation = 0; rotation < 4; rotation++) {
      const rotated = this.rotateBits(markerBits.bits, markerBits.size, rotation);

      // Try to match against dictionary
      for (const [id, pattern] of this.dictionary) {
        const distance = this.hammingDistance(rotated, pattern);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = {
            id,
            rotation: rotation as 0 | 1 | 2 | 3,
            hamming: distance,
          };
        }

        // Perfect match found
        if (distance === 0) {
          return bestMatch;
        }
      }
    }

    // Accept match if hamming distance is small enough
    // For 4x4 markers (16 bits), allow up to 2 bit errors
    const maxErrors = Math.floor(markerBits.size * markerBits.size * 0.125);

    if (bestMatch && bestMatch.hamming <= maxErrors) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Rotate bit pattern
   */
  private rotateBits(bits: number[], size: number, rotation: number): number[] {
    if (rotation === 0) return bits;

    const rotated = new Array(bits.length);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const srcIdx = y * size + x;
        let dstX = x;
        let dstY = y;

        // Apply rotation
        for (let r = 0; r < rotation; r++) {
          const temp = dstX;
          dstX = size - 1 - dstY;
          dstY = temp;
        }

        const dstIdx = dstY * size + dstX;
        rotated[dstIdx] = bits[srcIdx];
      }
    }

    return rotated;
  }

  /**
   * Calculate Hamming distance between two bit patterns
   */
  private hammingDistance(bits1: number[], bits2: number[]): number {
    if (bits1.length !== bits2.length) return Infinity;

    let distance = 0;
    for (let i = 0; i < bits1.length; i++) {
      if (bits1[i] !== bits2[i]) {
        distance++;
      }
    }

    return distance;
  }

  /**
   * Load ArUco dictionary
   */
  private loadDictionary(size: DictionarySize): Map<number, number[]> {
    const dict = new Map<number, number[]>();

    switch (size) {
      case 4:
        return this.getAruco4x4Dictionary();
      case 5:
        return this.getAruco5x5Dictionary();
      case 6:
        return this.getAruco6x6Dictionary();
      default:
        return this.getAruco4x4Dictionary();
    }
  }

  /**
   * ArUco 4x4 dictionary (50 markers)
   * Subset of standard ArUco markers with good inter-marker distance
   */
  private getAruco4x4Dictionary(): Map<number, number[]> {
    const dict = new Map<number, number[]>();

    // ArUco 4x4_50 dictionary (simplified subset)
    // Format: outer 16 bits (row-major order)
    const patterns = [
      [0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0], // ID 0
      [0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0], // ID 1
      [0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0], // ID 2
      [1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0], // ID 3
      [1, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0], // ID 4
      [0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0], // ID 5
      [1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0], // ID 6
      [1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0], // ID 7
      [0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0], // ID 8
      [1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0], // ID 9
    ];

    patterns.forEach((pattern, id) => {
      dict.set(id, pattern);
    });

    return dict;
  }

  /**
   * ArUco 5x5 dictionary (subset)
   */
  private getAruco5x5Dictionary(): Map<number, number[]> {
    const dict = new Map<number, number[]>();

    // ArUco 5x5 has 1000 markers, include just a subset for now
    // Would need to load full dictionary for production

    return dict;
  }

  /**
   * ArUco 6x6 dictionary (subset)
   */
  private getAruco6x6Dictionary(): Map<number, number[]> {
    const dict = new Map<number, number[]>();

    // ArUco 6x6 has 1000 markers, include just a subset for now
    // Would need to load full dictionary for production

    return dict;
  }

  /**
   * Verify marker has valid border (should be all black)
   */
  static verifyBorder(imageData: Uint8Array, imageSize: number, markerSize: number): boolean {
    const cellSize = imageSize / (markerSize + 2);
    let blackPixels = 0;
    let totalBorderPixels = 0;

    // Check top and bottom border
    for (let x = 0; x < imageSize; x++) {
      // Top border
      const topY = Math.floor(cellSize * 0.5);
      const topIdx = topY * imageSize + x;
      if (imageData[topIdx] < 127) blackPixels++;
      totalBorderPixels++;

      // Bottom border
      const bottomY = Math.floor(cellSize * (markerSize + 1.5));
      const bottomIdx = bottomY * imageSize + x;
      if (imageData[bottomIdx] < 127) blackPixels++;
      totalBorderPixels++;
    }

    // Check left and right border
    for (let y = 0; y < imageSize; y++) {
      // Left border
      const leftX = Math.floor(cellSize * 0.5);
      const leftIdx = y * imageSize + leftX;
      if (imageData[leftIdx] < 127) blackPixels++;
      totalBorderPixels++;

      // Right border
      const rightX = Math.floor(cellSize * (markerSize + 1.5));
      const rightIdx = y * imageSize + rightX;
      if (imageData[rightIdx] < 127) blackPixels++;
      totalBorderPixels++;
    }

    // At least 75% of border should be black
    const blackRatio = blackPixels / totalBorderPixels;
    return blackRatio >= 0.75;
  }
}
