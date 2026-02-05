/**
 * Mesh Reconstructor
 * Orchestrates depth integration and mesh extraction
 *
 * High-level API for real-time mesh reconstruction from depth maps
 */

import { DepthMap } from '../depth/depth-map';
import { TSDFFusion, type TSDFFusionConfig } from './tsdf-fusion';
import { MarchingCubes, type MarchingCubesConfig, type ExtractedMesh } from './marching-cubes';
import type { CameraIntrinsics } from '../tracking/pose-estimator';
import { Matrix4 } from '../math/matrix';
import { Logger } from '../../utils/logger';

const log = Logger.create('MeshReconstructor');

/**
 * Mesh reconstructor configuration
 */
export interface MeshReconstructorConfig extends TSDFFusionConfig {
  meshExtractionInterval?: number;  // Extract mesh every N frames (default: 30)
  meshConfig?: MarchingCubesConfig;  // Marching cubes config
  autoExtract?: boolean;              // Automatically extract mesh (default: true)
}

/**
 * Mesh reconstruction statistics
 */
export interface ReconstructionStats {
  integratedFrames: number;
  voxelCount: number;
  memoryUsageMB: number;
  lastMeshVertices: number;
  lastMeshTriangles: number;
  lastExtractionTimeMs: number;
  averageIntegrationTimeMs: number;
}

/**
 * High-level mesh reconstruction API
 */
export class MeshReconstructor {
  private config: Required<MeshReconstructorConfig>;
  private tsdf: TSDFFusion;
  private marchingCubes: MarchingCubes;
  private frameCount: number = 0;
  private lastMesh: ExtractedMesh | null = null;
  private integrationTimes: number[] = [];

  constructor(config: MeshReconstructorConfig) {
    this.config = {
      voxelSize: config.voxelSize,
      truncationDistance: config.truncationDistance,
      maxWeight: config.maxWeight,
      maxVoxels: config.maxVoxels ?? 1_000_000,
      integrationDistance: config.integrationDistance ?? config.truncationDistance * 3,
      minDepth: config.minDepth ?? 0.1,
      maxDepth: config.maxDepth ?? 10.0,
      depthThreshold: config.depthThreshold ?? 0.1,
      meshExtractionInterval: config.meshExtractionInterval ?? 30,
      meshConfig: config.meshConfig ?? {},
      autoExtract: config.autoExtract ?? true,
    };

    this.tsdf = new TSDFFusion({
      voxelSize: this.config.voxelSize,
      truncationDistance: this.config.truncationDistance,
      maxWeight: this.config.maxWeight,
      maxVoxels: this.config.maxVoxels,
      integrationDistance: this.config.integrationDistance,
      minDepth: this.config.minDepth,
      maxDepth: this.config.maxDepth,
      depthThreshold: this.config.depthThreshold,
    });

    this.marchingCubes = new MarchingCubes(config.meshConfig);

    log.info('Mesh reconstructor initialized', {
      voxelSize: this.config.voxelSize,
      extractionInterval: this.config.meshExtractionInterval,
    });
  }

  /**
   * Integrate depth map into reconstruction
   */
  integrateDepth(
    depthMap: DepthMap,
    cameraPose: Matrix4,
    cameraIntrinsics: CameraIntrinsics
  ): void {
    const startTime = performance.now();

    const voxelsUpdated = this.tsdf.integrate(
      depthMap,
      cameraPose,
      cameraIntrinsics
    );

    const elapsedTime = performance.now() - startTime;
    this.integrationTimes.push(elapsedTime);
    if (this.integrationTimes.length > 60) {
      this.integrationTimes.shift(); // Keep last 60 samples
    }

    this.frameCount++;

    // Auto-extract mesh at interval
    if (
      this.config.autoExtract &&
      this.frameCount % this.config.meshExtractionInterval === 0
    ) {
      this.extractMesh();
    }

    log.debug(`Integrated depth map, updated ${voxelsUpdated} voxels`);
  }

  /**
   * Extract triangle mesh from current TSDF volume
   */
  extractMesh(): ExtractedMesh {
    const startTime = performance.now();

    const voxelGrid = this.tsdf.getVoxelGrid();
    const mesh = this.marchingCubes.extractMesh(voxelGrid);

    const elapsedTime = performance.now() - startTime;
    this.lastMesh = mesh;

    log.info(
      `Extracted mesh: ${mesh.vertices.length} vertices, ${mesh.triangles.length} triangles in ${elapsedTime.toFixed(1)}ms`
    );

    return mesh;
  }

  /**
   * Get last extracted mesh
   */
  getLastMesh(): ExtractedMesh | null {
    return this.lastMesh;
  }

  /**
   * Get reconstruction statistics
   */
  getStats(): ReconstructionStats {
    const tsdfStats = this.tsdf.getStats();

    return {
      integratedFrames: tsdfStats.integratedFrames,
      voxelCount: tsdfStats.voxelCount,
      memoryUsageMB: tsdfStats.memoryUsage,
      lastMeshVertices: this.lastMesh ? this.lastMesh.vertices.length : 0,
      lastMeshTriangles: this.lastMesh ? this.lastMesh.triangles.length : 0,
      lastExtractionTimeMs: 0, // Would track this separately
      averageIntegrationTimeMs:
        this.integrationTimes.reduce((a, b) => a + b, 0) /
        Math.max(1, this.integrationTimes.length),
    };
  }

  /**
   * Reset reconstruction
   */
  reset(): void {
    this.tsdf.reset();
    this.frameCount = 0;
    this.lastMesh = null;
    this.integrationTimes = [];
    log.info('Mesh reconstruction reset');
  }

  /**
   * Prune low-confidence voxels
   */
  prune(minWeight: number = 0.1): number {
    const removed = this.tsdf.prune(minWeight);
    log.debug(`Pruned ${removed} low-confidence voxels`);
    return removed;
  }

  /**
   * Update extraction interval
   */
  setExtractionInterval(frames: number): void {
    this.config.meshExtractionInterval = frames;
    log.debug(`Mesh extraction interval set to ${frames} frames`);
  }

  /**
   * Enable/disable auto extraction
   */
  setAutoExtract(enabled: boolean): void {
    this.config.autoExtract = enabled;
    log.debug(`Auto extraction ${enabled ? 'enabled' : 'disabled'}`);
  }
}
