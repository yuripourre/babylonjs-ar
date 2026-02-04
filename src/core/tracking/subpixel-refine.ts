/**
 * Sub-pixel Corner Refinement
 * Improves corner localization accuracy from pixel-level to sub-pixel precision
 *
 * Methods implemented:
 * 1. Centroid-based refinement (fast, simple)
 * 2. Gradient-based refinement (most accurate)
 * 3. Parabola fitting (balanced)
 *
 * Based on:
 * - OpenCV cornerSubPix implementation
 * - "Accurate and Robust Localization of Corners Using Differential Geometrical Properties"
 *   by Haralick & Shapiro
 *
 * Typical improvement: 0.1-0.3 pixels accuracy (2-3× better than integer pixels)
 */

import type { MarkerCorners } from '../detection/marker-detector';

export interface SubPixelConfig {
  windowSize?: number; // Search window radius (default: 5 pixels)
  zeroZone?: number; // Dead zone to avoid singularities (default: 1)
  maxIterations?: number; // Max iterations for iterative methods (default: 30)
  epsilon?: number; // Convergence threshold (default: 0.01)
  method?: 'centroid' | 'gradient' | 'parabola'; // Refinement method (default: 'gradient')
}

export class SubPixelRefine {
  private config: Required<SubPixelConfig>;

  constructor(config: SubPixelConfig = {}) {
    this.config = {
      windowSize: config.windowSize ?? 5,
      zeroZone: config.zeroZone ?? 1,
      maxIterations: config.maxIterations ?? 30,
      epsilon: config.epsilon ?? 0.01,
      method: config.method ?? 'gradient',
    };
  }

  /**
   * Refine marker corners to sub-pixel accuracy
   *
   * @param corners - Integer pixel corners
   * @param imageData - Grayscale image data
   * @param imageWidth - Image width
   * @param imageHeight - Image height
   * @returns Refined corners with sub-pixel accuracy
   */
  refineCorners(
    corners: MarkerCorners,
    imageData: Uint8Array,
    imageWidth: number,
    imageHeight: number
  ): MarkerCorners {
    return {
      topLeft: this.refineCorner(
        corners.topLeft,
        imageData,
        imageWidth,
        imageHeight
      ),
      topRight: this.refineCorner(
        corners.topRight,
        imageData,
        imageWidth,
        imageHeight
      ),
      bottomRight: this.refineCorner(
        corners.bottomRight,
        imageData,
        imageWidth,
        imageHeight
      ),
      bottomLeft: this.refineCorner(
        corners.bottomLeft,
        imageData,
        imageWidth,
        imageHeight
      ),
    };
  }

  /**
   * Refine a single corner to sub-pixel accuracy
   */
  private refineCorner(
    corner: [number, number],
    imageData: Uint8Array,
    imageWidth: number,
    imageHeight: number
  ): [number, number] {
    switch (this.config.method) {
      case 'centroid':
        return this.refineCentroid(corner, imageData, imageWidth, imageHeight);
      case 'gradient':
        return this.refineGradient(corner, imageData, imageWidth, imageHeight);
      case 'parabola':
        return this.refineParabola(corner, imageData, imageWidth, imageHeight);
      default:
        return corner;
    }
  }

  /**
   * Centroid-based refinement (fastest, ~0.2 pixel accuracy)
   * Computes weighted centroid in local window
   */
  private refineCentroid(
    corner: [number, number],
    imageData: Uint8Array,
    imageWidth: number,
    imageHeight: number
  ): [number, number] {
    const [cx, cy] = corner;
    const win = this.config.windowSize;

    let sumX = 0;
    let sumY = 0;
    let sumWeight = 0;

    // Iterate over window
    for (let dy = -win; dy <= win; dy++) {
      for (let dx = -win; dx <= win; dx++) {
        const x = Math.floor(cx + dx);
        const y = Math.floor(cy + dy);

        // Check bounds
        if (x < 0 || x >= imageWidth || y < 0 || y >= imageHeight) continue;

        // Get pixel intensity (weight)
        const idx = y * imageWidth + x;
        const intensity = imageData[idx];

        // Threshold: only use strong corners
        if (intensity > 128) {
          // Inverted for corners (corners are typically dark)
          continue;
        }

        const weight = 255 - intensity; // Invert: darker = higher weight

        sumX += x * weight;
        sumY += y * weight;
        sumWeight += weight;
      }
    }

    if (sumWeight === 0) {
      return corner; // No refinement possible
    }

    return [sumX / sumWeight, sumY / sumWeight];
  }

  /**
   * Gradient-based refinement (most accurate, ~0.1 pixel accuracy)
   * Uses image gradients to find saddle point (corner)
   *
   * Based on OpenCV cornerSubPix algorithm
   */
  private refineGradient(
    corner: [number, number],
    imageData: Uint8Array,
    imageWidth: number,
    imageHeight: number
  ): [number, number] {
    let [x, y] = corner;
    const win = this.config.windowSize;
    const zeroZone = this.config.zeroZone;

    for (let iter = 0; iter < this.config.maxIterations; iter++) {
      const cx = Math.floor(x);
      const cy = Math.floor(y);

      let A11 = 0,
        A12 = 0,
        A22 = 0; // Matrix A (2×2)
      let b1 = 0,
        b2 = 0; // Vector b (2×1)

      // Iterate over window (excluding zero zone)
      for (let dy = -win; dy <= win; dy++) {
        for (let dx = -win; dx <= win; dx++) {
          // Skip zero zone (dead region around corner to avoid singularities)
          if (Math.abs(dx) < zeroZone && Math.abs(dy) < zeroZone) continue;

          const px = cx + dx;
          const py = cy + dy;

          // Check bounds
          if (px < 1 || px >= imageWidth - 1 || py < 1 || py >= imageHeight - 1)
            continue;

          // Compute image gradients using Sobel
          const gx = this.computeGradientX(imageData, px, py, imageWidth);
          const gy = this.computeGradientY(imageData, px, py, imageWidth);

          // Compute difference from current estimate
          const diffX = px - x;
          const diffY = py - y;

          // Build normal equation: A * delta = b
          // where delta = [dx, dy]^T is the correction
          A11 += gx * gx;
          A12 += gx * gy;
          A22 += gy * gy;

          b1 += gx * (gx * diffX + gy * diffY);
          b2 += gy * (gx * diffX + gy * diffY);
        }
      }

      // Solve 2×2 system: A * delta = b
      const det = A11 * A22 - A12 * A12;
      if (Math.abs(det) < 1e-10) {
        break; // Singular matrix, stop refinement
      }

      const deltaX = (A22 * b1 - A12 * b2) / det;
      const deltaY = (A11 * b2 - A12 * b1) / det;

      // Update estimate
      x += deltaX;
      y += deltaY;

      // Check convergence
      if (Math.abs(deltaX) < this.config.epsilon && Math.abs(deltaY) < this.config.epsilon) {
        break;
      }

      // Clamp to bounds
      x = Math.max(0, Math.min(imageWidth - 1, x));
      y = Math.max(0, Math.min(imageHeight - 1, y));
    }

    return [x, y];
  }

  /**
   * Parabola fitting refinement (balanced, ~0.15 pixel accuracy)
   * Fits 2D parabola to corner region
   */
  private refineParabola(
    corner: [number, number],
    imageData: Uint8Array,
    imageWidth: number,
    imageHeight: number
  ): [number, number] {
    const [cx, cy] = corner;

    // Extract 3×3 window around corner
    const window: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.floor(cx + dx);
        const y = Math.floor(cy + dy);

        if (x >= 0 && x < imageWidth && y >= 0 && y < imageHeight) {
          const idx = y * imageWidth + x;
          window.push(imageData[idx]);
        } else {
          window.push(0); // Out of bounds
        }
      }
    }

    // Fit parabola: f(x,y) = ax² + by² + cxy + dx + ey + f
    // Find extremum: ∂f/∂x = 0, ∂f/∂y = 0

    // Simplified: use finite differences to find sub-pixel peak
    // For corner (minimum), invert values
    const values = window.map(v => 255 - v);

    // Compute gradients and second derivatives
    const fx = (values[5] - values[3]) / 2; // ∂f/∂x
    const fy = (values[7] - values[1]) / 2; // ∂f/∂y
    const fxx = values[5] - 2 * values[4] + values[3]; // ∂²f/∂x²
    const fyy = values[7] - 2 * values[4] + values[1]; // ∂²f/∂y²

    // Sub-pixel offset from parabola peak
    let dx = 0;
    let dy = 0;

    if (Math.abs(fxx) > 1e-6) {
      dx = -fx / fxx;
    }
    if (Math.abs(fyy) > 1e-6) {
      dy = -fy / fyy;
    }

    // Clamp offset to ±0.5 pixels
    dx = Math.max(-0.5, Math.min(0.5, dx));
    dy = Math.max(-0.5, Math.min(0.5, dy));

    return [cx + dx, cy + dy];
  }

  /**
   * Compute horizontal gradient using Sobel operator
   */
  private computeGradientX(
    imageData: Uint8Array,
    x: number,
    y: number,
    width: number
  ): number {
    // Sobel X kernel:
    // [-1  0  1]
    // [-2  0  2]
    // [-1  0  1]

    const tl = imageData[(y - 1) * width + (x - 1)];
    const tr = imageData[(y - 1) * width + (x + 1)];
    const ml = imageData[y * width + (x - 1)];
    const mr = imageData[y * width + (x + 1)];
    const bl = imageData[(y + 1) * width + (x - 1)];
    const br = imageData[(y + 1) * width + (x + 1)];

    return (tr + 2 * mr + br - tl - 2 * ml - bl) / 8;
  }

  /**
   * Compute vertical gradient using Sobel operator
   */
  private computeGradientY(
    imageData: Uint8Array,
    x: number,
    y: number,
    width: number
  ): number {
    // Sobel Y kernel:
    // [-1 -2 -1]
    // [ 0  0  0]
    // [ 1  2  1]

    const tl = imageData[(y - 1) * width + (x - 1)];
    const tm = imageData[(y - 1) * width + x];
    const tr = imageData[(y - 1) * width + (x + 1)];
    const bl = imageData[(y + 1) * width + (x - 1)];
    const bm = imageData[(y + 1) * width + x];
    const br = imageData[(y + 1) * width + (x + 1)];

    return (bl + 2 * bm + br - tl - 2 * tm - tr) / 8;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SubPixelConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Quick helper function for one-off corner refinement
 */
export function refineCorners(
  corners: MarkerCorners,
  imageData: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  config?: SubPixelConfig
): MarkerCorners {
  const refiner = new SubPixelRefine(config);
  return refiner.refineCorners(corners, imageData, imageWidth, imageHeight);
}
