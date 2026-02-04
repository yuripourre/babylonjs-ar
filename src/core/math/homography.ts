/**
 * Homography Calculator
 * Computes perspective transformation matrix from point correspondences
 */

import type { Point } from '../detection/contour-processor';

export class Homography {
  /**
   * Compute homography matrix from 4 point correspondences
   * Maps source quad to destination quad
   */
  static compute(
    src: [Point, Point, Point, Point],
    dst: [Point, Point, Point, Point]
  ): Float32Array {
    // Build system of equations Ah = 0
    // Where h is the homography matrix (9 elements, but h33 = 1)
    const A: number[][] = [];

    for (let i = 0; i < 4; i++) {
      const x = src[i].x;
      const y = src[i].y;
      const u = dst[i].x;
      const v = dst[i].y;

      // Two equations per correspondence
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, -u]);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y, -v]);
    }

    // Solve using SVD or direct method
    // For 4 points, we can use a direct solution
    const h = this.solveHomography(A);

    // Convert to 3x3 matrix format (column-major for GPU)
    return new Float32Array([
      h[0], h[3], h[6],
      h[1], h[4], h[7],
      h[2], h[5], h[8],
    ]);
  }

  /**
   * Solve homography using direct linear transformation
   */
  private static solveHomography(A: number[][]): number[] {
    // Simplified solution for 4 point correspondences
    // In production, would use proper SVD

    // For now, use a simplified approach
    // This assumes well-conditioned inputs

    const n = A.length;
    const m = A[0].length;

    // Gaussian elimination with partial pivoting
    const augmented = A.map(row => [...row]);

    for (let i = 0; i < Math.min(n, m); i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }

      // Swap rows
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      // Make all rows below this one 0 in current column
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j < m; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }

    // Back substitution
    const h = new Array(m).fill(0);
    for (let i = Math.min(n, m) - 1; i >= 0; i--) {
      let sum = augmented[i][m - 1];
      for (let j = i + 1; j < m - 1; j++) {
        sum -= augmented[i][j] * h[j];
      }
      h[i] = sum / augmented[i][i];
    }

    // Normalize so h[8] = 1
    const scale = h[8] || 1;
    return h.map(v => v / scale);
  }

  /**
   * Compute inverse homography
   */
  static invert(H: Float32Array): Float32Array {
    // Convert from column-major to row-major for easier manipulation
    const h11 = H[0], h21 = H[1], h31 = H[2];
    const h12 = H[3], h22 = H[4], h32 = H[5];
    const h13 = H[6], h23 = H[7], h33 = H[8];

    // Compute determinant
    const det =
      h11 * (h22 * h33 - h23 * h32) -
      h12 * (h21 * h33 - h23 * h31) +
      h13 * (h21 * h32 - h22 * h31);

    if (Math.abs(det) < 1e-10) {
      throw new Error('Homography is singular');
    }

    const invDet = 1.0 / det;

    // Compute inverse (column-major output)
    return new Float32Array([
      (h22 * h33 - h23 * h32) * invDet,
      (h23 * h31 - h21 * h33) * invDet,
      (h21 * h32 - h22 * h31) * invDet,
      (h13 * h32 - h12 * h33) * invDet,
      (h11 * h33 - h13 * h31) * invDet,
      (h12 * h31 - h11 * h32) * invDet,
      (h12 * h23 - h13 * h22) * invDet,
      (h13 * h21 - h11 * h23) * invDet,
      (h11 * h22 - h12 * h21) * invDet,
    ]);
  }

  /**
   * Apply homography to a point
   */
  static transform(H: Float32Array, point: Point): Point {
    const x = point.x;
    const y = point.y;

    const w = H[6] * x + H[7] * y + H[8];

    return {
      x: (H[0] * x + H[1] * y + H[2]) / w,
      y: (H[3] * x + H[4] * y + H[5]) / w,
    };
  }

  /**
   * Create homography for extracting marker to square
   */
  static quadToSquare(
    quad: [Point, Point, Point, Point],
    squareSize: number
  ): Float32Array {
    const dst: [Point, Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: squareSize, y: 0 },
      { x: squareSize, y: squareSize },
      { x: 0, y: squareSize },
    ];

    return this.compute(quad, dst);
  }
}
