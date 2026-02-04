/**
 * RANSAC for Pose Estimation
 * RANdom SAmple Consensus - Robust outlier rejection for PnP
 *
 * Based on:
 * "Random sample consensus: a paradigm for model fitting with applications
 * to image analysis and automated cartography" by Fischler & Bolles (1981)
 *
 * Key features:
 * - Handles outliers (mismatched correspondences)
 * - Finds best pose from noisy data
 * - Configurable confidence and error thresholds
 * - Adaptive iteration count based on inlier ratio
 */

import { Vector3 } from '../math/vector';
import { EPnP, type EPnPResult } from './epnp';

export interface RANSACConfig {
  maxIterations?: number; // Maximum RANSAC iterations (default: 100)
  confidence?: number; // Desired confidence level 0-1 (default: 0.99)
  inlierThreshold?: number; // Max reprojection error for inliers (default: 3.0 pixels)
  minInliers?: number; // Minimum inliers to accept pose (default: 4)
  earlyTermination?: boolean; // Stop early if good pose found (default: true)
  minSampleSize?: number; // Minimum points for pose estimation (default: 4)
}

export interface RANSACResult extends EPnPResult {
  inliers: number[]; // Indices of inlier correspondences
  inlierRatio: number; // Ratio of inliers to total points
  iterations: number; // Number of RANSAC iterations performed
}

export class RANSACPose {
  private config: Required<RANSACConfig>;

  constructor(config: RANSACConfig = {}) {
    this.config = {
      maxIterations: config.maxIterations ?? 100,
      confidence: config.confidence ?? 0.99,
      inlierThreshold: config.inlierThreshold ?? 3.0,
      minInliers: config.minInliers ?? 4,
      earlyTermination: config.earlyTermination ?? true,
      minSampleSize: config.minSampleSize ?? 4,
    };
  }

  /**
   * Estimate pose using RANSAC
   *
   * @param objectPoints - 3D points in world coordinates
   * @param imagePoints - Normalized 2D points
   * @returns Best pose with inlier information
   */
  estimatePose(
    objectPoints: Vector3[],
    imagePoints: Vector3[]
  ): RANSACResult | null {
    const n = objectPoints.length;

    if (n < this.config.minSampleSize || n !== imagePoints.length) {
      return null;
    }

    let bestPose: EPnPResult | null = null;
    let bestInliers: number[] = [];
    let bestInlierCount = 0;

    // Compute adaptive iteration count
    let maxIterations = this.config.maxIterations;
    let iterationCount = 0;

    while (iterationCount < maxIterations) {
      // Step 1: Randomly sample minimal set (4 points for PnP)
      const sampleIndices = this.randomSample(n, this.config.minSampleSize);

      const sampleObjectPoints = sampleIndices.map(i => objectPoints[i]);
      const sampleImagePoints = sampleIndices.map(i => imagePoints[i]);

      // Step 2: Estimate pose from sample
      const pose = EPnP.solve(sampleObjectPoints, sampleImagePoints);
      if (!pose) {
        iterationCount++;
        continue;
      }

      // Step 3: Count inliers (points with reprojection error < threshold)
      const inliers = this.findInliers(
        objectPoints,
        imagePoints,
        pose,
        this.config.inlierThreshold
      );

      // Step 4: Update best model if more inliers
      if (inliers.length > bestInlierCount) {
        bestInlierCount = inliers.length;
        bestInliers = inliers;
        bestPose = pose;

        // Update iteration count based on inlier ratio
        const inlierRatio = inliers.length / n;
        maxIterations = this.computeAdaptiveIterations(
          inlierRatio,
          this.config.minSampleSize,
          this.config.confidence
        );

        // Early termination if very good fit
        if (
          this.config.earlyTermination &&
          inliers.length >= Math.max(this.config.minInliers, n * 0.8)
        ) {
          break;
        }
      }

      iterationCount++;
    }

    // Check if we have enough inliers
    if (!bestPose || bestInlierCount < this.config.minInliers) {
      return null;
    }

    // Step 5: Refine pose using all inliers
    const refinedPose = this.refinePose(
      objectPoints,
      imagePoints,
      bestInliers,
      bestPose
    );

    return {
      ...refinedPose,
      inliers: bestInliers,
      inlierRatio: bestInlierCount / n,
      iterations: iterationCount,
    };
  }

  /**
   * Randomly sample k indices from range [0, n)
   */
  private randomSample(n: number, k: number): number[] {
    const indices: number[] = [];
    const available = Array.from({ length: n }, (_, i) => i);

    for (let i = 0; i < k; i++) {
      const idx = Math.floor(Math.random() * available.length);
      indices.push(available[idx]);
      available.splice(idx, 1);
    }

    return indices;
  }

  /**
   * Find inlier correspondences based on reprojection error
   */
  private findInliers(
    objectPoints: Vector3[],
    imagePoints: Vector3[],
    pose: EPnPResult,
    threshold: number
  ): number[] {
    const inliers: number[] = [];

    for (let i = 0; i < objectPoints.length; i++) {
      const error = this.computeReprojectionError(
        objectPoints[i],
        imagePoints[i],
        pose.matrix
      );

      if (error < threshold) {
        inliers.push(i);
      }
    }

    return inliers;
  }

  /**
   * Compute reprojection error for a single correspondence
   */
  private computeReprojectionError(
    objectPoint: Vector3,
    imagePoint: Vector3,
    transformMatrix: import('../math/matrix').Matrix4
  ): number {
    // Transform 3D point
    const transformed = transformMatrix.transformPoint(objectPoint);

    // Perspective projection (assuming normalized coordinates)
    let projected: Vector3;
    if (transformed.z !== 0) {
      projected = new Vector3(
        transformed.x / transformed.z,
        transformed.y / transformed.z,
        1
      );
    } else {
      projected = transformed;
    }

    // Compute Euclidean distance
    const dx = projected.x - imagePoint.x;
    const dy = projected.y - imagePoint.y;

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Refine pose using all inlier correspondences
   */
  private refinePose(
    objectPoints: Vector3[],
    imagePoints: Vector3[],
    inlierIndices: number[],
    initialPose: EPnPResult
  ): EPnPResult {
    // Extract inlier points
    const inlierObjectPoints = inlierIndices.map(i => objectPoints[i]);
    const inlierImagePoints = inlierIndices.map(i => imagePoints[i]);

    // Re-estimate pose using all inliers
    const refinedPose = EPnP.solve(inlierObjectPoints, inlierImagePoints);

    // Return refined pose if better, otherwise return initial
    if (refinedPose && refinedPose.reprojectionError < initialPose.reprojectionError) {
      return refinedPose;
    }

    return initialPose;
  }

  /**
   * Compute adaptive iteration count based on inlier ratio
   *
   * Formula: N = log(1 - confidence) / log(1 - inlierRatio^sampleSize)
   *
   * This ensures we have high confidence of sampling all inliers at least once
   */
  private computeAdaptiveIterations(
    inlierRatio: number,
    sampleSize: number,
    confidence: number
  ): number {
    if (inlierRatio >= 0.99) {
      return 1; // Nearly perfect, stop immediately
    }

    if (inlierRatio < 0.01) {
      return this.config.maxIterations; // Too few inliers, use max
    }

    const pAllInliers = Math.pow(inlierRatio, sampleSize);
    const numIterations = Math.log(1 - confidence) / Math.log(1 - pAllInliers);

    return Math.min(
      Math.max(Math.ceil(numIterations), 1),
      this.config.maxIterations
    );
  }

  /**
   * Update RANSAC configuration
   */
  updateConfig(config: Partial<RANSACConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<RANSACConfig> {
    return { ...this.config };
  }
}

/**
 * Quick helper function for one-off pose estimation with RANSAC
 */
export function estimatePoseRANSAC(
  objectPoints: Vector3[],
  imagePoints: Vector3[],
  config?: RANSACConfig
): RANSACResult | null {
  const ransac = new RANSACPose(config);
  return ransac.estimatePose(objectPoints, imagePoints);
}
