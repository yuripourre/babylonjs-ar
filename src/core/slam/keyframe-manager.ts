/**
 * Keyframe Manager
 * Decides when to create keyframes and manages keyframe database
 */

import type { Keyframe, KeyframePose, KeyframeFeature, SLAMConfig } from './types';
import { Matrix4 } from '../math/matrix';
import { Quaternion } from '../math/quaternion';
import { Vector3 } from '../math/vector';

export interface KeyframeCandidate {
  timestamp: number;
  pose: KeyframePose;
  features: KeyframeFeature[];
}

export class KeyframeManager {
  private config: Required<Pick<
    SLAMConfig,
    'minKeyframeTranslation' | 'minKeyframeRotation' | 'minKeyframeInterval' | 'maxKeyframes'
  >>;

  private lastKeyframe: Keyframe | null = null;
  private lastKeyframeTime: number = 0;

  constructor(config: SLAMConfig = {}) {
    this.config = {
      minKeyframeTranslation: config.minKeyframeTranslation ?? 0.1, // 10cm
      minKeyframeRotation: config.minKeyframeRotation ?? 0.2, // ~11 degrees
      minKeyframeInterval: config.minKeyframeInterval ?? 200, // 200ms
      maxKeyframes: config.maxKeyframes ?? 100,
    };
  }

  /**
   * Check if a new keyframe should be created
   */
  shouldCreateKeyframe(candidate: KeyframeCandidate, numTrackedFeatures: number): boolean {
    const now = performance.now();

    // Always create first keyframe
    if (this.lastKeyframe === null) {
      console.log('[KeyframeManager] Creating first keyframe');
      return true;
    }

    // Check minimum time interval
    if (now - this.lastKeyframeTime < this.config.minKeyframeInterval) {
      return false;
    }

    // Check translation
    const translation = Vector3.distance(
      candidate.pose.position,
      this.lastKeyframe.pose.position
    );

    if (translation >= this.config.minKeyframeTranslation) {
      console.log(`[KeyframeManager] Translation threshold met: ${translation.toFixed(3)}m`);
      return true;
    }

    // Check rotation
    const rotation = this.computeRotationDifference(
      candidate.pose.rotation,
      this.lastKeyframe.pose.rotation
    );

    if (rotation >= this.config.minKeyframeRotation) {
      console.log(`[KeyframeManager] Rotation threshold met: ${rotation.toFixed(3)} rad`);
      return true;
    }

    // Check feature tracking quality
    const lastFeatureCount = this.lastKeyframe.features.length;
    if (lastFeatureCount > 0) {
      const featureRatio = numTrackedFeatures / lastFeatureCount;

      // Create keyframe if we've lost too many features
      if (featureRatio < 0.5) {
        console.log(`[KeyframeManager] Feature loss threshold met: ${(featureRatio * 100).toFixed(1)}%`);
        return true;
      }
    }

    return false;
  }

  /**
   * Compute rotation difference between two quaternions (in radians)
   */
  private computeRotationDifference(q1: Quaternion, q2: Quaternion): number {
    // Compute relative rotation: q_rel = q1 * q2^-1
    const q2Inv = Quaternion.conjugate(q2);
    const qRel = Quaternion.multiply(q1, q2Inv);

    // Extract angle from quaternion: angle = 2 * acos(w)
    const angle = 2 * Math.acos(Math.abs(qRel.w));

    return angle;
  }

  /**
   * Register a keyframe as created
   */
  registerKeyframe(keyframe: Keyframe): void {
    this.lastKeyframe = keyframe;
    this.lastKeyframeTime = performance.now();
  }

  /**
   * Get keyframes with highest overlap to current frame
   */
  getBestOverlapKeyframes(
    candidate: KeyframeCandidate,
    allKeyframes: Keyframe[],
    maxKeyframes: number = 5
  ): Keyframe[] {
    // Compute overlap score for each keyframe
    const scores = allKeyframes.map(kf => ({
      keyframe: kf,
      score: this.computeOverlapScore(candidate, kf),
    }));

    // Sort by score (descending)
    scores.sort((a, b) => b.score - a.score);

    // Return top N
    return scores.slice(0, maxKeyframes).map(s => s.keyframe);
  }

  /**
   * Compute overlap score between candidate and keyframe
   * Higher score = more overlap (better for tracking)
   */
  private computeOverlapScore(candidate: KeyframeCandidate, keyframe: Keyframe): number {
    // Distance score (closer = better, but not too close)
    const distance = Vector3.distance(candidate.pose.position, keyframe.pose.position);
    let distanceScore = 0;

    if (distance < 0.5) {
      distanceScore = 1.0 - (distance / 0.5); // Perfect at 0m, 0 at 0.5m
    } else if (distance < 2.0) {
      distanceScore = 0.5; // Moderate distance
    } else {
      distanceScore = Math.max(0, 1.0 - (distance / 10.0)); // Far away
    }

    // Viewing angle score (similar direction = better)
    const viewingAngle = this.computeViewingAngleDifference(
      candidate.pose.rotation,
      keyframe.pose.rotation
    );
    const angleScore = Math.max(0, 1.0 - (viewingAngle / Math.PI));

    // Combined score
    return 0.6 * distanceScore + 0.4 * angleScore;
  }

  /**
   * Compute viewing angle difference (simpler than full rotation)
   */
  private computeViewingAngleDifference(q1: Quaternion, q2: Quaternion): number {
    // Convert quaternions to forward vectors
    const forward1 = this.quaternionToForwardVector(q1);
    const forward2 = this.quaternionToForwardVector(q2);

    // Compute angle between vectors
    const dot = Vector3.dot(forward1, forward2);
    return Math.acos(Math.max(-1, Math.min(1, dot)));
  }

  /**
   * Get forward vector from quaternion (assuming Z-forward convention)
   */
  private quaternionToForwardVector(q: Quaternion): Vector3 {
    // Rotate (0, 0, -1) by quaternion
    const x = 2 * (q.x * q.z - q.w * q.y);
    const y = 2 * (q.y * q.z + q.w * q.x);
    const z = 1 - 2 * (q.x * q.x + q.y * q.y);

    return new Vector3(x, y, z);
  }

  /**
   * Select reference keyframes for triangulation
   * Returns keyframes with good baseline and overlap
   */
  selectReferenceKeyframes(
    candidate: KeyframeCandidate,
    allKeyframes: Keyframe[],
    numReferences: number = 3
  ): Keyframe[] {
    const references: Array<{ keyframe: Keyframe; score: number }> = [];

    for (const kf of allKeyframes) {
      const distance = Vector3.distance(candidate.pose.position, kf.pose.position);

      // Good baseline: 0.3m - 3.0m
      if (distance < 0.3 || distance > 3.0) {continue;}

      // Compute baseline score
      const baselineScore = Math.min(distance / 1.0, 1.0); // Peak at 1m

      // Compute overlap score
      const overlapScore = this.computeOverlapScore(candidate, kf);

      // Combined score (favor baseline for triangulation)
      const score = 0.7 * baselineScore + 0.3 * overlapScore;

      references.push({ keyframe: kf, score });
    }

    // Sort by score and return top N
    references.sort((a, b) => b.score - a.score);
    return references.slice(0, numReferences).map(r => r.keyframe);
  }

  /**
   * Get statistics
   */
  getStats(): {
    lastKeyframeTime: number;
    timeSinceLastKeyframe: number;
  } {
    return {
      lastKeyframeTime: this.lastKeyframeTime,
      timeSinceLastKeyframe: this.lastKeyframeTime > 0
        ? performance.now() - this.lastKeyframeTime
        : 0,
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.lastKeyframe = null;
    this.lastKeyframeTime = 0;
    console.log('[KeyframeManager] Reset');
  }
}
