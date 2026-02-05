/**
 * TSDF Fusion
 * Integrates depth maps into TSDF voxel volume
 *
 * Algorithm: Truncated Signed Distance Field fusion
 * - For each depth pixel, project ray into 3D space
 * - Update voxels along ray with signed distance to surface
 * - Weighted averaging for robustness
 */

import { Vector3 } from '../math/vector';
import { Matrix4 } from '../math/matrix';
import { DepthMap } from '../depth/depth-map';
import { SparseVoxelGrid, type VoxelGridConfig } from './sparse-voxel-grid';
import type { CameraIntrinsics } from '../tracking/pose-estimator';
import { Logger } from '../../utils/logger';

const log = Logger.create('TSDFFusion');

/**
 * TSDF Fusion configuration
 */
export interface TSDFFusionConfig extends VoxelGridConfig {
  integrationDistance?: number;  // Max distance to integrate along ray
  minDepth?: number;             // Ignore depth < minDepth
  maxDepth?: number;             // Ignore depth > maxDepth
  depthThreshold?: number;       // Depth discontinuity threshold
}

/**
 * TSDF Fusion engine
 */
export class TSDFFusion {
  private config: Required<TSDFFusionConfig>;
  private voxelGrid: SparseVoxelGrid;
  private integratedFrames: number = 0;

  constructor(config: TSDFFusionConfig) {
    this.config = {
      voxelSize: config.voxelSize,
      truncationDistance: config.truncationDistance,
      maxWeight: config.maxWeight,
      maxVoxels: config.maxVoxels ?? 1_000_000,
      integrationDistance: config.integrationDistance ?? config.truncationDistance * 3,
      minDepth: config.minDepth ?? 0.1,
      maxDepth: config.maxDepth ?? 10.0,
      depthThreshold: config.depthThreshold ?? 0.1,
    };

    this.voxelGrid = new SparseVoxelGrid({
      voxelSize: this.config.voxelSize,
      truncationDistance: this.config.truncationDistance,
      maxWeight: this.config.maxWeight,
      maxVoxels: this.config.maxVoxels,
    });

    log.info('TSDF fusion initialized', {
      voxelSize: this.config.voxelSize,
      truncation: this.config.truncationDistance,
    });
  }

  /**
   * Integrate depth map into TSDF volume
   */
  integrate(
    depthMap: DepthMap,
    cameraPose: Matrix4,
    cameraIntrinsics: CameraIntrinsics
  ): number {
    const startTime = performance.now();
    let voxelsUpdated = 0;

    // Extract camera parameters
    const { fx, fy, cx, cy } = cameraIntrinsics;

    // Get camera position (translation from pose matrix)
    const cameraPos = new Vector3(
      cameraPose.data[12],
      cameraPose.data[13],
      cameraPose.data[14]
    );

    // Determine integration region (frustum bounds)
    const bounds = this.computeIntegrationBounds(
      depthMap,
      cameraPose,
      cameraIntrinsics
    );

    // Iterate over voxels in integration region
    const voxelGrid = this.voxelGrid;
    const minCoord = voxelGrid.worldToVoxel(bounds.min);
    const maxCoord = voxelGrid.worldToVoxel(bounds.max);

    for (let x = minCoord.x; x <= maxCoord.x; x++) {
      for (let y = minCoord.y; y <= maxCoord.y; y++) {
        for (let z = minCoord.z; z <= maxCoord.z; z++) {
          const coord = { x, y, z };
          const voxelCenter = voxelGrid.voxelToWorld(coord);

          // Transform voxel to camera space
          const voxelCam = this.transformToCameraSpace(
            voxelCenter,
            cameraPose.inverse()
          );

          // Skip if behind camera
          if (voxelCam.z <= 0) continue;

          // Project to image space
          const u = (voxelCam.x * fx) / voxelCam.z + cx;
          const v = (voxelCam.y * fy) / voxelCam.z + cy;

          // Check if within image bounds
          if (u < 0 || u >= depthMap.width || v < 0 || v >= depthMap.height) {
            continue;
          }

          // Get depth at projected pixel
          const measuredDepth = depthMap.getDepthMeters(
            Math.floor(u),
            Math.floor(v)
          );

          if (measuredDepth === null) continue;
          if (measuredDepth < this.config.minDepth || measuredDepth > this.config.maxDepth) {
            continue;
          }

          // Compute signed distance
          const distance = measuredDepth - voxelCam.z;

          // Skip if too far from surface
          if (Math.abs(distance) > this.config.integrationDistance) {
            continue;
          }

          // Truncate signed distance
          const truncatedSDF = Math.max(
            -1.0,
            Math.min(1.0, distance / this.config.truncationDistance)
          );

          // Compute weight (higher confidence near camera)
          const weight = this.computeWeight(voxelCam.z, measuredDepth);

          // Update voxel
          if (voxelGrid.updateVoxel(coord, truncatedSDF, weight)) {
            voxelsUpdated++;
          }
        }
      }
    }

    this.integratedFrames++;

    const elapsedTime = performance.now() - startTime;
    log.debug(
      `Integrated depth map in ${elapsedTime.toFixed(1)}ms, updated ${voxelsUpdated} voxels`
    );

    return voxelsUpdated;
  }

  /**
   * Compute integration bounds based on depth map frustum
   */
  private computeIntegrationBounds(
    depthMap: DepthMap,
    cameraPose: Matrix4,
    cameraIntrinsics: CameraIntrinsics
  ): { min: Vector3; max: Vector3 } {
    // Sample depth at image corners and center
    const corners = [
      { x: 0, y: 0 },
      { x: depthMap.width - 1, y: 0 },
      { x: 0, y: depthMap.height - 1 },
      { x: depthMap.width - 1, y: depthMap.height - 1 },
      { x: depthMap.width / 2, y: depthMap.height / 2 },
    ];

    const { fx, fy, cx, cy } = cameraIntrinsics;

    let minBounds = new Vector3(Infinity, Infinity, Infinity);
    let maxBounds = new Vector3(-Infinity, -Infinity, -Infinity);

    for (const corner of corners) {
      const depth = depthMap.getDepthMeters(corner.x, corner.y);
      if (!depth) continue;

      // Unproject to camera space
      const xCam = ((corner.x - cx) * depth) / fx;
      const yCam = ((corner.y - cy) * depth) / fy;
      const zCam = depth;

      // Transform to world space
      const pointCam = new Vector3(xCam, yCam, zCam);
      const pointWorld = this.transformToWorldSpace(pointCam, cameraPose);

      // Expand bounds
      minBounds = new Vector3(
        Math.min(minBounds.x, pointWorld.x),
        Math.min(minBounds.y, pointWorld.y),
        Math.min(minBounds.z, pointWorld.z)
      );
      maxBounds = new Vector3(
        Math.max(maxBounds.x, pointWorld.x),
        Math.max(maxBounds.y, pointWorld.y),
        Math.max(maxBounds.z, pointWorld.z)
      );
    }

    // Add margin
    const margin = this.config.integrationDistance;
    minBounds = minBounds.subtract(new Vector3(margin, margin, margin));
    maxBounds = maxBounds.add(new Vector3(margin, margin, margin));

    return { min: minBounds, max: maxBounds };
  }

  /**
   * Transform point to camera space
   */
  private transformToCameraSpace(point: Vector3, viewMatrix: Matrix4): Vector3 {
    const m = viewMatrix.data;
    const x = m[0] * point.x + m[4] * point.y + m[8] * point.z + m[12];
    const y = m[1] * point.x + m[5] * point.y + m[9] * point.z + m[13];
    const z = m[2] * point.x + m[6] * point.y + m[10] * point.z + m[14];
    return new Vector3(x, y, z);
  }

  /**
   * Transform point to world space
   */
  private transformToWorldSpace(point: Vector3, pose: Matrix4): Vector3 {
    const m = pose.data;
    const x = m[0] * point.x + m[4] * point.y + m[8] * point.z + m[12];
    const y = m[1] * point.x + m[5] * point.y + m[9] * point.z + m[13];
    const z = m[2] * point.x + m[6] * point.y + m[10] * point.z + m[14];
    return new Vector3(x, y, z);
  }

  /**
   * Compute integration weight based on depth
   */
  private computeWeight(voxelDepth: number, measuredDepth: number): number {
    // Weight decreases with distance from camera
    const depthWeight = 1.0 / (voxelDepth + 0.1);

    // Weight decreases if voxel is far from measured surface
    const surfaceDistance = Math.abs(voxelDepth - measuredDepth);
    const surfaceWeight = Math.exp(
      -(surfaceDistance * surfaceDistance) / (2 * this.config.truncationDistance * this.config.truncationDistance)
    );

    return depthWeight * surfaceWeight;
  }

  /**
   * Get voxel grid
   */
  getVoxelGrid(): SparseVoxelGrid {
    return this.voxelGrid;
  }

  /**
   * Get integration statistics
   */
  getStats(): {
    integratedFrames: number;
    voxelCount: number;
    memoryUsage: number;
    bounds: { min: Vector3; max: Vector3 };
  } {
    return {
      integratedFrames: this.integratedFrames,
      voxelCount: this.voxelGrid.getVoxelCount(),
      memoryUsage: this.voxelGrid.getMemoryUsage(),
      bounds: this.voxelGrid.getBounds(),
    };
  }

  /**
   * Reset TSDF volume
   */
  reset(): void {
    this.voxelGrid.clear();
    this.integratedFrames = 0;
    log.info('TSDF volume reset');
  }

  /**
   * Prune low-confidence voxels
   */
  prune(minWeight: number = 0.1): number {
    return this.voxelGrid.pruneOldVoxels(minWeight);
  }
}
