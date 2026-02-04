/**
 * Point Cloud Generator
 * Generates 3D point clouds from depth maps or features
 */

import { Vector3 } from '../math/vector';
import type { Keypoint } from './feature-detector';
import type { CameraIntrinsics } from '../tracking/pose-estimator';

export interface Point3D {
  position: Vector3;
  normal?: Vector3;
  confidence: number;
  color?: [number, number, number];
}

export class PointCloudGenerator {
  private intrinsics: CameraIntrinsics;

  constructor(intrinsics: CameraIntrinsics) {
    this.intrinsics = intrinsics;
  }

  /**
   * Generate point cloud from depth map
   */
  generateFromDepth(
    depthData: Float32Array,
    width: number,
    height: number,
    minDepth: number = 0.1,
    maxDepth: number = 10.0,
    step: number = 1
  ): Float32Array {
    const points: number[] = [];

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = y * width + x;
        const depth = depthData[idx];

        if (depth > minDepth && depth < maxDepth) {
          // Unproject to 3D
          const point = this.unproject(x, y, depth);

          // Store as vec4 (xyz + valid flag)
          points.push(point.x, point.y, point.z, 1.0);
        }
      }
    }

    return new Float32Array(points);
  }

  /**
   * Generate point cloud from keypoints with depth
   */
  generateFromKeypoints(
    keypoints: Keypoint[],
    depthData: Float32Array,
    width: number,
    height: number
  ): Float32Array {
    const points: number[] = [];

    for (const kp of keypoints) {
      const x = Math.floor(kp.x);
      const y = Math.floor(kp.y);

      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = y * width + x;
        const depth = depthData[idx];

        if (depth > 0.1 && depth < 10.0) {
          const point = this.unproject(x, y, depth);
          points.push(point.x, point.y, point.z, 1.0);
        }
      }
    }

    return new Float32Array(points);
  }

  /**
   * Generate sparse point cloud from stereo matches
   */
  generateFromStereo(
    matches: Array<{ x1: number; y1: number; x2: number; y2: number }>,
    baseline: number,
    focalLength: number
  ): Float32Array {
    const points: number[] = [];

    for (const match of matches) {
      // Compute disparity
      const disparity = Math.abs(match.x1 - match.x2);

      if (disparity > 0.5) {
        // Avoid division by zero
        const depth = (baseline * focalLength) / disparity;

        if (depth > 0.1 && depth < 10.0) {
          const point = this.unproject(match.x1, match.y1, depth);
          points.push(point.x, point.y, point.z, 1.0);
        }
      }
    }

    return new Float32Array(points);
  }

  /**
   * Unproject 2D point with depth to 3D
   */
  private unproject(x: number, y: number, depth: number): Vector3 {
    const { fx, fy, cx, cy } = this.intrinsics;

    const X = ((x - cx) * depth) / fx;
    const Y = ((y - cy) * depth) / fy;
    const Z = depth;

    return new Vector3(X, Y, Z);
  }

  /**
   * Project 3D point to 2D
   */
  project(point: Vector3): [number, number, number] {
    const { fx, fy, cx, cy } = this.intrinsics;

    if (point.z <= 0) {
      return [-1, -1, 0];
    }

    const x = (point.x * fx) / point.z + cx;
    const y = (point.y * fy) / point.z + cy;

    return [x, y, point.z];
  }

  /**
   * Hash 3D voxel coordinates to integer key
   */
  private hash3D(x: number, y: number, z: number): number {
    // Large prime numbers for good distribution
    return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
  }

  /**
   * Downsample point cloud
   */
  downsample(points: Float32Array, gridSize: number = 0.05): Float32Array {
    // Voxel grid downsampling with integer keys
    const voxels = new Map<number, Vector3>();

    for (let i = 0; i < points.length; i += 4) {
      const x = points[i];
      const y = points[i + 1];
      const z = points[i + 2];

      // Compute voxel coordinates
      const vx = Math.floor(x / gridSize);
      const vy = Math.floor(y / gridSize);
      const vz = Math.floor(z / gridSize);

      // Hash to integer key (much faster than string)
      const key = this.hash3D(vx, vy, vz);

      if (!voxels.has(key)) {
        voxels.set(key, new Vector3(x, y, z));
      }
    }

    // Convert back to array
    const downsampled: number[] = [];
    for (const point of voxels.values()) {
      downsampled.push(point.x, point.y, point.z, 1.0);
    }

    return new Float32Array(downsampled);
  }

  /**
   * Compute normals for point cloud
   */
  computeNormals(
    points: Float32Array,
    k: number = 10
  ): Float32Array {
    const numPoints = points.length / 4;
    const normals = new Float32Array(points.length);

    // For each point, find k nearest neighbors and compute normal
    for (let i = 0; i < numPoints; i++) {
      const p = new Vector3(
        points[i * 4],
        points[i * 4 + 1],
        points[i * 4 + 2]
      );

      // Find k nearest (simplified: just use spatial neighbors)
      const neighbors: Vector3[] = [];

      for (let j = 0; j < numPoints && neighbors.length < k; j++) {
        if (i === j) continue;

        const q = new Vector3(
          points[j * 4],
          points[j * 4 + 1],
          points[j * 4 + 2]
        );

        if (p.distanceTo(q) < 0.5) {
          neighbors.push(q);
        }
      }

      if (neighbors.length >= 3) {
        // Compute normal using PCA (simplified: cross product)
        const v1 = neighbors[0].subtract(p);
        const v2 = neighbors[1].subtract(p);
        const normal = v1.cross(v2).normalize();

        normals[i * 4] = normal.x;
        normals[i * 4 + 1] = normal.y;
        normals[i * 4 + 2] = normal.z;
        normals[i * 4 + 3] = 1.0; // Confidence
      }
    }

    return normals;
  }

  /**
   * Filter points by distance
   */
  filterByDistance(
    points: Float32Array,
    minDist: number,
    maxDist: number
  ): Float32Array {
    const filtered: number[] = [];

    for (let i = 0; i < points.length; i += 4) {
      const x = points[i];
      const y = points[i + 1];
      const z = points[i + 2];

      const dist = Math.sqrt(x * x + y * y + z * z);

      if (dist >= minDist && dist <= maxDist) {
        filtered.push(x, y, z, points[i + 3]);
      }
    }

    return new Float32Array(filtered);
  }

  /**
   * Update camera intrinsics
   */
  updateIntrinsics(intrinsics: CameraIntrinsics): void {
    this.intrinsics = intrinsics;
  }
}
