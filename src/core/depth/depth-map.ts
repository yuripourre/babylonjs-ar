/**
 * Depth Map
 * Represents a 2D depth image with utility methods
 */

import { Vector3 } from '../math/vector';

/**
 * Depth map data structure
 * Stores per-pixel depth values (0 = near, 1 = far)
 */
export class DepthMap {
  public readonly width: number;
  public readonly height: number;
  public readonly data: Float32Array; // Normalized depth values (0-1)
  public readonly timestamp: number;
  public readonly confidence: number; // Overall quality estimate

  // Physical depth range (in meters)
  public readonly minDepth: number;  // Near plane
  public readonly maxDepth: number;  // Far plane

  constructor(
    width: number,
    height: number,
    data: Float32Array,
    options: {
      minDepth?: number;
      maxDepth?: number;
      confidence?: number;
      timestamp?: number;
    } = {}
  ) {
    this.width = width;
    this.height = height;
    this.data = data;
    this.minDepth = options.minDepth ?? 0.1;   // 10cm
    this.maxDepth = options.maxDepth ?? 10.0;   // 10m
    this.confidence = options.confidence ?? 1.0;
    this.timestamp = options.timestamp ?? performance.now();

    // Validate data size
    if (data.length !== width * height) {
      throw new Error(
        `Depth data size mismatch: expected ${width * height}, got ${data.length}`
      );
    }
  }

  /**
   * Get depth value at pixel coordinates
   * Returns normalized depth (0-1) or null if out of bounds
   */
  getDepth(x: number, y: number): number | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }

    const index = Math.floor(y) * this.width + Math.floor(x);
    return this.data[index];
  }

  /**
   * Get depth value in meters
   */
  getDepthMeters(x: number, y: number): number | null {
    const normalized = this.getDepth(x, y);
    if (normalized === null) return null;

    return this.minDepth + normalized * (this.maxDepth - this.minDepth);
  }

  /**
   * Get depth with bilinear interpolation
   */
  getDepthInterpolated(x: number, y: number): number | null {
    if (x < 0 || x >= this.width - 1 || y < 0 || y >= this.height - 1) {
      return this.getDepth(Math.floor(x), Math.floor(y));
    }

    const x0 = Math.floor(x);
    const x1 = x0 + 1;
    const y0 = Math.floor(y);
    const y1 = y0 + 1;

    const fx = x - x0;
    const fy = y - y0;

    const d00 = this.getDepth(x0, y0) ?? 0;
    const d10 = this.getDepth(x1, y0) ?? 0;
    const d01 = this.getDepth(x0, y1) ?? 0;
    const d11 = this.getDepth(x1, y1) ?? 0;

    // Bilinear interpolation
    const d0 = d00 * (1 - fx) + d10 * fx;
    const d1 = d01 * (1 - fx) + d11 * fx;
    return d0 * (1 - fy) + d1 * fy;
  }

  /**
   * Unproject pixel to 3D point given camera intrinsics
   */
  unproject(
    x: number,
    y: number,
    fx: number,
    fy: number,
    cx: number,
    cy: number
  ): Vector3 | null {
    const depth = this.getDepthMeters(x, y);
    if (depth === null || depth <= 0) return null;

    // Pinhole camera model
    const x3d = (x - cx) * depth / fx;
    const y3d = (y - cy) * depth / fy;
    const z3d = depth;

    return new Vector3(x3d, y3d, z3d);
  }

  /**
   * Unproject entire depth map to point cloud
   */
  toPointCloud(
    fx: number,
    fy: number,
    cx: number,
    cy: number,
    stride: number = 1
  ): Vector3[] {
    const points: Vector3[] = [];

    for (let y = 0; y < this.height; y += stride) {
      for (let x = 0; x < this.width; x += stride) {
        const point = this.unproject(x, y, fx, fy, cx, cy);
        if (point) {
          points.push(point);
        }
      }
    }

    return points;
  }

  /**
   * Resize depth map to new dimensions
   */
  resize(newWidth: number, newHeight: number): DepthMap {
    const newData = new Float32Array(newWidth * newHeight);

    const scaleX = this.width / newWidth;
    const scaleY = this.height / newHeight;

    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcX = x * scaleX;
        const srcY = y * scaleY;

        const depth = this.getDepthInterpolated(srcX, srcY) ?? 0;
        newData[y * newWidth + x] = depth;
      }
    }

    return new DepthMap(newWidth, newHeight, newData, {
      minDepth: this.minDepth,
      maxDepth: this.maxDepth,
      confidence: this.confidence,
      timestamp: this.timestamp,
    });
  }

  /**
   * Apply bilateral filter for smoothing while preserving edges
   */
  bilateralFilter(
    spatialSigma: number = 3,
    rangeSigma: number = 0.1
  ): DepthMap {
    const filtered = new Float32Array(this.data.length);
    const radius = Math.ceil(spatialSigma * 3);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const centerDepth = this.getDepth(x, y) ?? 0;
        let sum = 0;
        let weight = 0;

        // Sample neighborhood
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) {
              continue;
            }

            const neighborDepth = this.getDepth(nx, ny) ?? 0;

            // Spatial weight
            const spatialDist = Math.sqrt(dx * dx + dy * dy);
            const spatialWeight = Math.exp(
              -(spatialDist * spatialDist) / (2 * spatialSigma * spatialSigma)
            );

            // Range weight (preserve edges)
            const rangeDist = Math.abs(centerDepth - neighborDepth);
            const rangeWeight = Math.exp(
              -(rangeDist * rangeDist) / (2 * rangeSigma * rangeSigma)
            );

            const w = spatialWeight * rangeWeight;
            sum += neighborDepth * w;
            weight += w;
          }
        }

        const index = y * this.width + x;
        filtered[index] = weight > 0 ? sum / weight : centerDepth;
      }
    }

    return new DepthMap(this.width, this.height, filtered, {
      minDepth: this.minDepth,
      maxDepth: this.maxDepth,
      confidence: this.confidence,
      timestamp: this.timestamp,
    });
  }

  /**
   * Compute surface normals from depth
   */
  computeNormals(
    fx: number,
    fy: number,
    cx: number,
    cy: number
  ): Float32Array {
    const normals = new Float32Array(this.width * this.height * 3);

    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        // Get 3D points
        const center = this.unproject(x, y, fx, fy, cx, cy);
        const right = this.unproject(x + 1, y, fx, fy, cx, cy);
        const down = this.unproject(x, y + 1, fx, fy, cx, cy);

        if (!center || !right || !down) continue;

        // Compute normal via cross product
        const dx = right.subtract(center);
        const dy = down.subtract(center);
        const normal = dx.cross(dy).normalize();

        const index = (y * this.width + x) * 3;
        normals[index] = normal.x;
        normals[index + 1] = normal.y;
        normals[index + 2] = normal.z;
      }
    }

    return normals;
  }

  /**
   * Convert to texture data (for visualization)
   */
  toImageData(): ImageData {
    const imageData = new ImageData(this.width, this.height);

    for (let i = 0; i < this.data.length; i++) {
      const depth = this.data[i];
      const value = Math.floor(depth * 255);

      imageData.data[i * 4] = value;     // R
      imageData.data[i * 4 + 1] = value; // G
      imageData.data[i * 4 + 2] = value; // B
      imageData.data[i * 4 + 3] = 255;   // A
    }

    return imageData;
  }

  /**
   * Create a visualization with color mapping
   */
  toColorMappedImageData(colormap: 'jet' | 'turbo' | 'viridis' = 'turbo'): ImageData {
    const imageData = new ImageData(this.width, this.height);

    for (let i = 0; i < this.data.length; i++) {
      const depth = this.data[i];
      const color = this.applyColormap(depth, colormap);

      imageData.data[i * 4] = color.r;
      imageData.data[i * 4 + 1] = color.g;
      imageData.data[i * 4 + 2] = color.b;
      imageData.data[i * 4 + 3] = 255;
    }

    return imageData;
  }

  /**
   * Apply colormap to depth value
   */
  private applyColormap(
    value: number,
    colormap: 'jet' | 'turbo' | 'viridis'
  ): { r: number; g: number; b: number } {
    // Turbo colormap (perceptually uniform)
    if (colormap === 'turbo') {
      const r = Math.max(0, Math.min(255, Math.floor(
        34.61 + value * (1172.33 - value * (10793.56 - value * (33300.12 - value * (38394.49 - value * 14825.05))))
      )));
      const g = Math.max(0, Math.min(255, Math.floor(
        23.31 + value * (557.33 + value * (1225.33 - value * (3574.96 - value * (1073.77 + value * 707.56))))
      )));
      const b = Math.max(0, Math.min(255, Math.floor(
        27.2 + value * (3211.1 - value * (15327.97 - value * (27814 - value * (22569.18 - value * 6838.66))))
      )));
      return { r, g, b };
    }

    // Simple jet colormap
    const r = Math.max(0, Math.min(255, Math.floor(255 * (1.5 - Math.abs(4 * value - 3)))));
    const g = Math.max(0, Math.min(255, Math.floor(255 * (1.5 - Math.abs(4 * value - 2)))));
    const b = Math.max(0, Math.min(255, Math.floor(255 * (1.5 - Math.abs(4 * value - 1)))));
    return { r, g, b };
  }

  /**
   * Clone depth map
   */
  clone(): DepthMap {
    return new DepthMap(
      this.width,
      this.height,
      new Float32Array(this.data),
      {
        minDepth: this.minDepth,
        maxDepth: this.maxDepth,
        confidence: this.confidence,
        timestamp: this.timestamp,
      }
    );
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    min: number;
    max: number;
    mean: number;
    median: number;
  } {
    const sorted = Array.from(this.data).sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];

    return { min, max, mean, median };
  }
}
