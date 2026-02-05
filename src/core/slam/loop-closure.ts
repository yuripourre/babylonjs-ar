/**
 * Loop Closure Detection
 * Detects when camera returns to previously visited location
 * Uses Bag-of-Words (BoW) approach for efficient place recognition
 */

import type { Keyframe, LoopClosureCandidate } from './types';
import { SLAMMapManager } from './slam-map';

export interface LoopClosureConfig {
  // Minimum keyframe interval between loop closure checks
  minInterval?: number; // frames

  // Similarity threshold for loop closure detection (0-1)
  similarityThreshold?: number;

  // Minimum number of covisible keyframes to consider
  minCovisibleKeyframes?: number;

  // Number of best candidates to return
  numCandidates?: number;

  // Enable geometric verification
  enableGeometricVerification?: boolean;

  // Minimum number of feature matches for geometric verification
  minMatches?: number;

  // RANSAC inlier threshold for geometric verification
  ransacThreshold?: number;
}

interface BoWVector {
  words: Map<number, number>; // word_id -> weight
  magnitude: number; // for normalization
}

export class LoopClosureDetector {
  private config: Required<LoopClosureConfig>;
  private map: SLAMMapManager;

  // Inverted index: word_id -> [keyframe_ids]
  private invertedIndex: Map<number, Set<number>> = new Map();

  // Keyframe BoW vectors
  private bowVectors: Map<number, BoWVector> = new Map();

  // Last loop closure detection frame
  private lastCheckFrame = 0;

  // Statistics
  private numDetections = 0;
  private numVerifications = 0;

  constructor(map: SLAMMapManager, config: LoopClosureConfig = {}) {
    this.map = map;
    this.config = {
      minInterval: config.minInterval ?? 10,
      similarityThreshold: config.similarityThreshold ?? 0.75,
      minCovisibleKeyframes: config.minCovisibleKeyframes ?? 3,
      numCandidates: config.numCandidates ?? 5,
      enableGeometricVerification: config.enableGeometricVerification ?? true,
      minMatches: config.minMatches ?? 15,
      ransacThreshold: config.ransacThreshold ?? 3.0,
    };
  }

  /**
   * Add keyframe to loop closure database
   */
  addKeyframe(keyframe: Keyframe): void {
    // Compute BoW vector for keyframe
    const bowVector = this.computeBoWVector(keyframe);
    this.bowVectors.set(keyframe.id, bowVector);

    // Update inverted index
    for (const [wordId, weight] of bowVector.words.entries()) {
      if (!this.invertedIndex.has(wordId)) {
        this.invertedIndex.set(wordId, new Set());
      }
      this.invertedIndex.get(wordId)!.add(keyframe.id);
    }
  }

  /**
   * Detect loop closure for current keyframe
   */
  detectLoopClosure(
    currentKeyframe: Keyframe,
    frameNumber: number
  ): LoopClosureCandidate[] {
    // Check if enough frames have passed since last check
    if (frameNumber - this.lastCheckFrame < this.config.minInterval) {
      return [];
    }

    this.lastCheckFrame = frameNumber;

    // Compute BoW vector for current keyframe
    const currentBoW = this.computeBoWVector(currentKeyframe);

    // Get candidate keyframes using inverted index
    const candidates = this.getCandidateKeyframes(currentKeyframe, currentBoW);

    if (candidates.length === 0) {
      return [];
    }

    // Compute similarity scores
    const scoredCandidates = candidates.map((candidate) => {
      const candidateBoW = this.bowVectors.get(candidate.id)!;
      const similarity = this.computeSimilarity(currentBoW, candidateBoW);

      return {
        queryKeyframeId: currentKeyframe.id,
        candidateKeyframeId: candidate.id,
        similarity,
        matchCount: 0, // will be computed in geometric verification
        inliers: 0,
      };
    });

    // Filter by similarity threshold
    let loopCandidates = scoredCandidates.filter(
      (c) => c.similarity >= this.config.similarityThreshold
    );

    if (loopCandidates.length === 0) {
      return [];
    }

    // Sort by similarity (descending)
    loopCandidates.sort((a, b) => b.similarity - a.similarity);

    // Take top N candidates
    loopCandidates = loopCandidates.slice(0, this.config.numCandidates);

    // Geometric verification
    if (this.config.enableGeometricVerification) {
      loopCandidates = this.geometricVerification(
        currentKeyframe,
        loopCandidates
      );
    }

    if (loopCandidates.length > 0) {
      this.numDetections++;
      console.log(
        `[Loop Closure] Detected ${loopCandidates.length} loop closure(s) for keyframe ${currentKeyframe.id}`
      );
    }

    return loopCandidates;
  }

  /**
   * Get statistics
   */
  getStats(): {
    numDetections: number;
    numVerifications: number;
    databaseSize: number;
    vocabularySize: number;
  } {
    return {
      numDetections: this.numDetections,
      numVerifications: this.numVerifications,
      databaseSize: this.bowVectors.size,
      vocabularySize: this.invertedIndex.size,
    };
  }

  /**
   * Clear database
   */
  clear(): void {
    this.invertedIndex.clear();
    this.bowVectors.clear();
    this.lastCheckFrame = 0;
    this.numDetections = 0;
    this.numVerifications = 0;
  }

  // ==================== Private Methods ====================

  /**
   * Compute Bag-of-Words vector for keyframe
   */
  private computeBoWVector(keyframe: Keyframe): BoWVector {
    const words = new Map<number, number>();

    // For each feature in keyframe, compute word ID and add to BoW
    for (const feature of keyframe.features) {
      // Simple vocabulary: hash descriptor to word ID
      // In production, use a trained vocabulary tree (e.g., DBoW2)
      const wordId = this.descriptorToWordId(feature.descriptor);

      // Increment word count (TF - term frequency)
      words.set(wordId, (words.get(wordId) ?? 0) + 1);
    }

    // Normalize by feature count (TF)
    const featureCount = keyframe.features.length;
    for (const [wordId, count] of words.entries()) {
      words.set(wordId, count / featureCount);
    }

    // Compute magnitude for cosine similarity
    let magnitude = 0;
    for (const weight of words.values()) {
      magnitude += weight * weight;
    }
    magnitude = Math.sqrt(magnitude);

    return { words, magnitude };
  }

  /**
   * Hash descriptor to word ID
   * Simplified approach - in production use trained vocabulary tree
   */
  private descriptorToWordId(descriptor: Uint8Array): number {
    // Simple hash: take first 4 bytes as word ID
    // This creates a vocabulary of 2^32 words
    // In production, use hierarchical k-means clustering (DBoW2)
    let hash = 0;
    for (let i = 0; i < Math.min(4, descriptor.length); i++) {
      hash = (hash << 8) | descriptor[i];
    }
    return hash;
  }

  /**
   * Get candidate keyframes using inverted index
   */
  private getCandidateKeyframes(
    currentKeyframe: Keyframe,
    currentBoW: BoWVector
  ): Keyframe[] {
    // Find keyframes that share words with current keyframe
    const candidateScores = new Map<number, number>();

    for (const wordId of currentBoW.words.keys()) {
      const keyframeIds = this.invertedIndex.get(wordId);
      if (!keyframeIds) continue;

      for (const keyframeId of keyframeIds) {
        // Skip current keyframe
        if (keyframeId === currentKeyframe.id) continue;

        // Skip recent keyframes (covisibility)
        const keyframe = this.map.getKeyframe(keyframeId);
        if (!keyframe) continue;

        const timeDiff = Math.abs(
          currentKeyframe.timestamp - keyframe.timestamp
        );
        if (timeDiff < 3000) continue; // 3 seconds minimum

        // Accumulate score
        candidateScores.set(
          keyframeId,
          (candidateScores.get(keyframeId) ?? 0) + 1
        );
      }
    }

    // Get keyframes with sufficient shared words
    const candidates: Keyframe[] = [];
    for (const [keyframeId, score] of candidateScores.entries()) {
      if (score >= this.config.minCovisibleKeyframes) {
        const keyframe = this.map.getKeyframe(keyframeId);
        if (keyframe) {
          candidates.push(keyframe);
        }
      }
    }

    return candidates;
  }

  /**
   * Compute cosine similarity between two BoW vectors
   */
  private computeSimilarity(bow1: BoWVector, bow2: BoWVector): number {
    if (bow1.magnitude === 0 || bow2.magnitude === 0) {
      return 0;
    }

    // Compute dot product
    let dotProduct = 0;
    for (const [wordId, weight1] of bow1.words.entries()) {
      const weight2 = bow2.words.get(wordId);
      if (weight2 !== undefined) {
        dotProduct += weight1 * weight2;
      }
    }

    // Cosine similarity
    return dotProduct / (bow1.magnitude * bow2.magnitude);
  }

  /**
   * Geometric verification using feature matching
   */
  private geometricVerification(
    currentKeyframe: Keyframe,
    candidates: LoopClosureCandidate[]
  ): LoopClosureCandidate[] {
    const verified: LoopClosureCandidate[] = [];

    for (const candidate of candidates) {
      const candidateKeyframe = this.map.getKeyframe(candidate.candidateKeyframeId);
      if (!candidateKeyframe) continue;

      // Match features between current and candidate keyframe
      const matches = this.matchFeatures(
        currentKeyframe,
        candidateKeyframe
      );

      if (matches.length < this.config.minMatches) {
        continue;
      }

      // RANSAC to find inliers
      const inliers = this.ransacPoseVerification(
        currentKeyframe,
        candidateKeyframe,
        matches
      );

      if (inliers >= this.config.minMatches) {
        verified.push({
          ...candidate,
          matchCount: matches.length,
          inliers,
        });
        this.numVerifications++;
      }
    }

    return verified;
  }

  /**
   * Match features between two keyframes
   */
  private matchFeatures(
    kf1: Keyframe,
    kf2: Keyframe
  ): Array<{ idx1: number; idx2: number }> {
    const matches: Array<{ idx1: number; idx2: number }> = [];

    // Brute force matching with ratio test
    for (let i = 0; i < kf1.features.length; i++) {
      const desc1 = kf1.features[i].descriptor;

      let bestDist = Infinity;
      let secondBestDist = Infinity;
      let bestIdx = -1;

      for (let j = 0; j < kf2.features.length; j++) {
        const desc2 = kf2.features[j].descriptor;
        const dist = this.hammingDistance(desc1, desc2);

        if (dist < bestDist) {
          secondBestDist = bestDist;
          bestDist = dist;
          bestIdx = j;
        } else if (dist < secondBestDist) {
          secondBestDist = dist;
        }
      }

      // Ratio test (Lowe's ratio)
      if (bestDist < 0.7 * secondBestDist && bestDist < 50) {
        matches.push({ idx1: i, idx2: bestIdx });
      }
    }

    return matches;
  }

  /**
   * Compute Hamming distance between two descriptors
   */
  private hammingDistance(desc1: Uint8Array, desc2: Uint8Array): number {
    let distance = 0;
    const len = Math.min(desc1.length, desc2.length);

    for (let i = 0; i < len; i++) {
      // Count set bits in XOR
      let xor = desc1[i] ^ desc2[i];
      while (xor) {
        distance += xor & 1;
        xor >>= 1;
      }
    }

    return distance;
  }

  /**
   * RANSAC-based pose verification
   */
  private ransacPoseVerification(
    kf1: Keyframe,
    kf2: Keyframe,
    matches: Array<{ idx1: number; idx2: number }>
  ): number {
    if (matches.length < 3) return 0;

    const maxIterations = 100;
    let bestInliers = 0;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Randomly sample 3 matches
      const sample: Array<{ idx1: number; idx2: number }> = [];
      const used = new Set<number>();

      while (sample.length < 3 && sample.length < matches.length) {
        const idx = Math.floor(Math.random() * matches.length);
        if (!used.has(idx)) {
          sample.push(matches[idx]);
          used.add(idx);
        }
      }

      if (sample.length < 3) break;

      // Compute inliers (simplified - just check reprojection error)
      let inliers = 0;
      for (const match of matches) {
        const feat1 = kf1.features[match.idx1];
        const feat2 = kf2.features[match.idx2];

        // Simple geometric consistency check
        const dx = feat1.x - feat2.x;
        const dy = feat1.y - feat2.y;
        const error = Math.sqrt(dx * dx + dy * dy);

        if (error < this.config.ransacThreshold) {
          inliers++;
        }
      }

      bestInliers = Math.max(bestInliers, inliers);
    }

    return bestInliers;
  }
}
