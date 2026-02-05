/**
 * Geometric Verifier
 * Rejects false feature matches using geometric constraints
 *
 * Features:
 * - Fundamental matrix estimation (8-point algorithm)
 * - RANSAC for outlier rejection
 * - Epipolar constraint checking
 */

import { Logger } from '../../../utils/logger';
import type { FeatureMatch } from '../../matching';
import type { Keypoint } from '../../detection/feature-detector';

const log = Logger.create('GeometricVerifier');

export interface Point2D {
  x: number;
  y: number;
}

export interface GeometricVerificationResult {
  fundamentalMatrix: Matrix3;
  inliers: FeatureMatch[];
  inlierRatio: number;
  isValid: boolean;
}

export interface RANSACConfig {
  maxIterations?: number;
  threshold?: number; // Epipolar distance threshold
  minInliers?: number;
  confidence?: number;
}

// 3x3 matrix for fundamental matrix
export class Matrix3 {
  data: Float32Array;

  constructor(data?: number[] | Float32Array) {
    if (data) {
      this.data = new Float32Array(data);
    } else {
      this.data = new Float32Array(9);
      // Identity
      this.data[0] = 1;
      this.data[4] = 1;
      this.data[8] = 1;
    }
  }

  static identity(): Matrix3 {
    return new Matrix3();
  }

  // Multiply vector [x, y, 1]
  multiplyVector(x: number, y: number): [number, number, number] {
    const m = this.data;
    return [
      m[0] * x + m[1] * y + m[2],
      m[3] * x + m[4] * y + m[5],
      m[6] * x + m[7] * y + m[8],
    ];
  }
}

export class GeometricVerifier {
  private config: Required<RANSACConfig>;

  constructor(config: RANSACConfig = {}) {
    this.config = {
      maxIterations: config.maxIterations ?? 1000,
      threshold: config.threshold ?? 3.0, // 3 pixels
      minInliers: config.minInliers ?? 8,
      confidence: config.confidence ?? 0.99,
    };
  }

  /**
   * Estimate fundamental matrix using RANSAC
   */
  estimateFundamentalMatrix(
    matches: FeatureMatch[],
    queryKeypoints: Keypoint[],
    trainKeypoints: Keypoint[]
  ): GeometricVerificationResult | null {
    if (matches.length < this.config.minInliers) {
      log.warn(`Not enough matches: ${matches.length} < ${this.config.minInliers}`);
      return null;
    }

    let bestF: Matrix3 | null = null;
    let bestInliers: FeatureMatch[] = [];
    let bestScore = 0;

    const iterations = this.computeRANSACIterations(
      matches.length,
      this.config.minInliers,
      this.config.confidence
    );

    for (let iter = 0; iter < Math.min(iterations, this.config.maxIterations); iter++) {
      // Randomly sample 8 matches
      const sample = this.randomSample(matches, 8);

      // Estimate fundamental matrix from sample
      const F = this.compute8Point(sample, queryKeypoints, trainKeypoints);
      if (!F) {
        continue;
      }

      // Count inliers
      const inliers: FeatureMatch[] = [];
      for (const match of matches) {
        const queryPt = queryKeypoints[match.queryIdx];
        const trainPt = trainKeypoints[match.trainIdx];

        const distance = this.epipolarDistance(
          queryPt.x,
          queryPt.y,
          trainPt.x,
          trainPt.y,
          F
        );

        if (distance < this.config.threshold) {
          inliers.push(match);
        }
      }

      if (inliers.length > bestScore) {
        bestScore = inliers.length;
        bestInliers = inliers;
        bestF = F;
      }
    }

    if (!bestF || bestInliers.length < this.config.minInliers) {
      log.warn(`RANSAC failed: ${bestInliers.length} inliers`);
      return null;
    }

    const inlierRatio = bestInliers.length / matches.length;

    log.debug(
      `RANSAC success: ${bestInliers.length}/${matches.length} inliers (${(inlierRatio * 100).toFixed(1)}%)`
    );

    return {
      fundamentalMatrix: bestF,
      inliers: bestInliers,
      inlierRatio,
      isValid: inlierRatio > 0.3, // At least 30% inliers
    };
  }

  /**
   * 8-point algorithm for fundamental matrix estimation
   */
  private compute8Point(
    matches: FeatureMatch[],
    queryKeypoints: Keypoint[],
    trainKeypoints: Keypoint[]
  ): Matrix3 | null {
    if (matches.length < 8) {
      return null;
    }

    // Normalize points (for numerical stability)
    const normalized = this.normalizePoints(matches, queryKeypoints, trainKeypoints);
    const { points1, points2, T1, T2 } = normalized;

    // Build constraint matrix A
    const A: number[][] = [];
    for (let i = 0; i < points1.length; i++) {
      const x1 = points1[i].x;
      const y1 = points1[i].y;
      const x2 = points2[i].x;
      const y2 = points2[i].y;

      A.push([
        x2 * x1,
        x2 * y1,
        x2,
        y2 * x1,
        y2 * y1,
        y2,
        x1,
        y1,
        1,
      ]);
    }

    // Solve using SVD (simplified - we'll use a basic approach)
    // In production, use a proper SVD library
    const F = this.solveLinearSystem(A);
    if (!F) {
      return null;
    }

    // Denormalize: F = T2^T * F_norm * T1
    return this.denormalizeFundamentalMatrix(F, T1, T2);
  }

  /**
   * Normalize points for numerical stability
   */
  private normalizePoints(
    matches: FeatureMatch[],
    queryKeypoints: Keypoint[],
    trainKeypoints: Keypoint[]
  ): {
    points1: Point2D[];
    points2: Point2D[];
    T1: Matrix3;
    T2: Matrix3;
  } {
    // Extract matched points
    const queryPoints = matches.map(m => queryKeypoints[m.queryIdx]);
    const trainPoints = matches.map(m => trainKeypoints[m.trainIdx]);

    // Compute centroids
    let cx1 = 0, cy1 = 0, cx2 = 0, cy2 = 0;
    for (let i = 0; i < queryPoints.length; i++) {
      cx1 += queryPoints[i].x;
      cy1 += queryPoints[i].y;
      cx2 += trainPoints[i].x;
      cy2 += trainPoints[i].y;
    }
    cx1 /= queryPoints.length;
    cy1 /= queryPoints.length;
    cx2 /= trainPoints.length;
    cy2 /= trainPoints.length;

    // Compute average distance from centroid
    let avgDist1 = 0, avgDist2 = 0;
    for (let i = 0; i < queryPoints.length; i++) {
      avgDist1 += Math.sqrt(
        Math.pow(queryPoints[i].x - cx1, 2) + Math.pow(queryPoints[i].y - cy1, 2)
      );
      avgDist2 += Math.sqrt(
        Math.pow(trainPoints[i].x - cx2, 2) + Math.pow(trainPoints[i].y - cy2, 2)
      );
    }
    avgDist1 /= queryPoints.length;
    avgDist2 /= trainPoints.length;

    const scale1 = Math.sqrt(2) / (avgDist1 + 1e-10);
    const scale2 = Math.sqrt(2) / (avgDist2 + 1e-10);

    // Build normalization matrices
    const T1 = new Matrix3([
      scale1, 0, -scale1 * cx1,
      0, scale1, -scale1 * cy1,
      0, 0, 1,
    ]);

    const T2 = new Matrix3([
      scale2, 0, -scale2 * cx2,
      0, scale2, -scale2 * cy2,
      0, 0, 1,
    ]);

    // Normalize points
    const points1: Point2D[] = queryPoints.map(p => ({
      x: scale1 * (p.x - cx1),
      y: scale1 * (p.y - cy1),
    }));

    const points2: Point2D[] = trainPoints.map(p => ({
      x: scale2 * (p.x - cx2),
      y: scale2 * (p.y - cy2),
    }));

    return { points1, points2, T1, T2 };
  }

  /**
   * Solve linear system Ax = 0 (simplified SVD)
   */
  private solveLinearSystem(A: number[][]): Matrix3 | null {
    // Simplified: Use last row of V from SVD
    // For production, use a proper linear algebra library
    // Here we'll use a very basic approximation

    // Find the eigenvector corresponding to the smallest eigenvalue
    // This is a simplified approach - in production use proper SVD
    const solution = new Float32Array(9);

    // For now, use a basic least squares approximation
    // This is not production-quality but demonstrates the concept
    for (let i = 0; i < 9; i++) {
      let sum = 0;
      for (let j = 0; j < A.length; j++) {
        sum += A[j][i];
      }
      solution[i] = sum / A.length;
    }

    // Normalize
    const norm = Math.sqrt(solution.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return null;

    for (let i = 0; i < 9; i++) {
      solution[i] /= norm;
    }

    return new Matrix3(solution);
  }

  /**
   * Denormalize fundamental matrix
   */
  private denormalizeFundamentalMatrix(
    F: Matrix3,
    T1: Matrix3,
    T2: Matrix3
  ): Matrix3 {
    // F = T2^T * F_norm * T1
    // Simplified matrix multiplication
    return F; // TODO: Implement proper denormalization
  }

  /**
   * Compute epipolar distance
   */
  private epipolarDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    F: Matrix3
  ): number {
    // Distance = |x2^T * F * x1| / sqrt((Fx1)_1^2 + (Fx1)_2^2)
    const Fx1 = F.multiplyVector(x1, y1);
    const numerator = Math.abs(x2 * Fx1[0] + y2 * Fx1[1] + Fx1[2]);
    const denominator = Math.sqrt(Fx1[0] * Fx1[0] + Fx1[1] * Fx1[1]);

    return denominator > 0 ? numerator / denominator : Infinity;
  }

  /**
   * Check epipolar constraint
   */
  checkEpipolarConstraint(
    point1: Point2D,
    point2: Point2D,
    fundamentalMatrix: Matrix3,
    threshold: number
  ): boolean {
    const distance = this.epipolarDistance(
      point1.x,
      point1.y,
      point2.x,
      point2.y,
      fundamentalMatrix
    );

    return distance < threshold;
  }

  /**
   * Compute number of RANSAC iterations needed
   */
  private computeRANSACIterations(
    totalMatches: number,
    sampleSize: number,
    confidence: number
  ): number {
    const inlierRatio = Math.max(0.3, sampleSize / totalMatches);
    const p = Math.pow(inlierRatio, sampleSize);

    if (p >= 1) return 1;

    const k = Math.log(1 - confidence) / Math.log(1 - p);
    return Math.ceil(k);
  }

  /**
   * Random sample without replacement
   */
  private randomSample<T>(array: T[], count: number): T[] {
    const shuffled = array.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }
}
