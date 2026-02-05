/**
 * Feature Matcher
 * Robust feature matching with Lowe's ratio test and optional cross-checking
 */

import {
  FEATURE_MATCH_DISTANCE_THRESHOLD,
  FEATURE_MATCH_RATIO_TEST_THRESHOLD,
} from '../constants';

export interface FeatureMatch {
  queryIdx: number;
  trainIdx: number;
  distance: number;
}

export interface FeatureMatcherConfig {
  /** Maximum distance threshold for a valid match */
  matchThreshold?: number;
  /** Ratio test threshold (Lowe's ratio) - lower is stricter */
  ratioTestThreshold?: number;
  /** Enable bidirectional cross-check filtering */
  enableCrossCheck?: boolean;
}

const DEFAULT_CONFIG: Required<FeatureMatcherConfig> = {
  matchThreshold: FEATURE_MATCH_DISTANCE_THRESHOLD,
  ratioTestThreshold: FEATURE_MATCH_RATIO_TEST_THRESHOLD,
  enableCrossCheck: false,
};

/**
 * Feature matcher using brute-force nearest neighbor with Hamming distance
 * Implements Lowe's ratio test for robust matching
 */
export class FeatureMatcher {
  private config: Required<FeatureMatcherConfig>;

  constructor(config: FeatureMatcherConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Match features using brute-force nearest neighbor
   *
   * @param descriptors1 Query descriptors (from current frame)
   * @param descriptors2 Train descriptors (from reference frame/map)
   * @returns Array of matches sorted by distance
   */
  matchBruteForce(
    descriptors1: Uint8Array[],
    descriptors2: Uint8Array[]
  ): FeatureMatch[] {
    if (descriptors1.length === 0 || descriptors2.length === 0) {
      return [];
    }

    const matches: FeatureMatch[] = [];

    // For each descriptor in set 1, find best and second-best matches in set 2
    for (let i = 0; i < descriptors1.length; i++) {
      let bestDist = Infinity;
      let secondBest = Infinity;
      let bestIdx = -1;

      // Brute-force search for nearest neighbors
      for (let j = 0; j < descriptors2.length; j++) {
        const dist = this.hammingDistance(descriptors1[i], descriptors2[j]);

        if (dist < bestDist) {
          secondBest = bestDist;
          bestDist = dist;
          bestIdx = j;
        } else if (dist < secondBest) {
          secondBest = dist;
        }
      }

      // Apply ratio test (Lowe's ratio) and distance threshold
      if (
        bestIdx !== -1 &&
        bestDist < this.config.ratioTestThreshold * secondBest &&
        bestDist < this.config.matchThreshold
      ) {
        matches.push({ queryIdx: i, trainIdx: bestIdx, distance: bestDist });
      }
    }

    // Sort by distance (best matches first)
    matches.sort((a, b) => a.distance - b.distance);

    return matches;
  }

  /**
   * Match features with optional cross-check filtering
   *
   * @param descriptors1 First descriptor set
   * @param descriptors2 Second descriptor set
   * @returns Filtered matches (cross-checked if enabled)
   */
  match(
    descriptors1: Uint8Array[],
    descriptors2: Uint8Array[]
  ): FeatureMatch[] {
    const matches12 = this.matchBruteForce(descriptors1, descriptors2);

    if (!this.config.enableCrossCheck) {
      return matches12;
    }

    // Bidirectional matching for cross-check
    const matches21 = this.matchBruteForce(descriptors2, descriptors1);

    return this.crossCheck(matches12, matches21);
  }

  /**
   * Cross-check filtering: only keep matches that are mutual nearest neighbors
   *
   * @param matches12 Matches from set 1 to set 2
   * @param matches21 Matches from set 2 to set 1
   * @returns Mutually consistent matches
   */
  crossCheck(
    matches12: FeatureMatch[],
    matches21: FeatureMatch[]
  ): FeatureMatch[] {
    const crossChecked: FeatureMatch[] = [];

    // Build reverse lookup map for efficiency
    const reverseMap = new Map<number, number>();
    for (const match of matches21) {
      reverseMap.set(match.queryIdx, match.trainIdx);
    }

    // Check each forward match for consistency
    for (const match of matches12) {
      const reverseTrainIdx = reverseMap.get(match.trainIdx);

      // Match is consistent if reverse lookup points back to original query
      if (reverseTrainIdx === match.queryIdx) {
        crossChecked.push(match);
      }
    }

    return crossChecked;
  }

  /**
   * Compute Hamming distance between two binary descriptors
   * Counts the number of differing bits
   *
   * @param a First descriptor
   * @param b Second descriptor
   * @returns Hamming distance (number of different bits)
   */
  private hammingDistance(a: Uint8Array, b: Uint8Array): number {
    if (a.length !== b.length) {
      throw new Error('Descriptor lengths must match');
    }

    let dist = 0;

    // XOR each byte and count set bits (population count)
    for (let i = 0; i < a.length; i++) {
      let xor = a[i] ^ b[i];

      // Brian Kernighan's algorithm for counting set bits
      while (xor) {
        dist++;
        xor &= xor - 1; // Clear least significant bit
      }
    }

    return dist;
  }

  /**
   * Filter matches by distance threshold
   *
   * @param matches Input matches
   * @param maxDistance Maximum allowed distance
   * @returns Filtered matches
   */
  filterByDistance(matches: FeatureMatch[], maxDistance: number): FeatureMatch[] {
    return matches.filter(m => m.distance <= maxDistance);
  }

  /**
   * Get top N best matches
   *
   * @param matches Input matches (should be sorted)
   * @param n Number of matches to keep
   * @returns Top N matches
   */
  topNMatches(matches: FeatureMatch[], n: number): FeatureMatch[] {
    return matches.slice(0, Math.min(n, matches.length));
  }

  /**
   * Update configuration
   *
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<FeatureMatcherConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<FeatureMatcherConfig> {
    return { ...this.config };
  }
}
