/**
 * Mesh Reconstruction Plugin
 * Real-time 3D mesh reconstruction from depth maps
 */

import { BaseARPlugin, type ARContext } from '../core/plugin-system';
import { type ARFrame } from '../core/engine';
import { MeshReconstructor, type MeshReconstructorConfig } from '../core/mesh/mesh-reconstructor';
import { ARError, ErrorCodes } from '../core/errors';
import { Matrix4 } from '../core/math/matrix';
import { Logger } from '../utils/logger';

const log = Logger.create('MeshReconstructionPlugin');

/**
 * Mesh reconstruction plugin configuration
 */
export interface MeshReconstructionPluginConfig {
  /** Voxel size in meters */
  voxelSize?: number;

  /** TSDF truncation distance */
  truncationDistance?: number;

  /** Maximum voxels to store */
  maxVoxels?: number;

  /** Mesh extraction interval (frames) */
  extractionInterval?: number;

  /** Auto-extract mesh */
  autoExtract?: boolean;
}

/**
 * Mesh reconstruction plugin
 * Depends on depth estimation plugin
 */
export class MeshReconstructionPlugin extends BaseARPlugin {
  readonly name = 'mesh-reconstruction';
  readonly version = '1.0.0';
  readonly priority = 60; // Run after depth estimation
  readonly dependencies = ['depth-estimation']; // Requires depth!

  private reconstructor?: MeshReconstructor;
  private config: Required<MeshReconstructionPluginConfig>;
  private frameCount = 0;

  constructor(config: MeshReconstructionPluginConfig = {}) {
    super();

    this.config = {
      voxelSize: config.voxelSize ?? 0.01, // 1cm
      truncationDistance: config.truncationDistance ?? 0.05, // 5cm
      maxVoxels: config.maxVoxels ?? 1_000_000,
      extractionInterval: config.extractionInterval ?? 30,
      autoExtract: config.autoExtract ?? true,
    };
  }

  protected async onInitialize(context: ARContext): Promise<void> {
    log.info('Initializing mesh reconstruction plugin', this.config);

    try {
      // Create mesh reconstructor
      const meshConfig: MeshReconstructorConfig = {
        voxelSize: this.config.voxelSize,
        truncationDistance: this.config.truncationDistance,
        maxWeight: 100, // Default max weight
        maxVoxels: this.config.maxVoxels,
        meshExtractionInterval: this.config.extractionInterval,
        autoExtract: this.config.autoExtract,
      };

      this.reconstructor = new MeshReconstructor(meshConfig);

      log.info('Mesh reconstruction plugin initialized');
    } catch (error) {
      throw new ARError(
        'Failed to initialize mesh reconstructor',
        ErrorCodes.INITIALIZATION_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  async processFrame(frame: ARFrame, context: ARContext): Promise<void> {
    if (!this.enabled || !this.reconstructor) {
      return;
    }

    // Check if depth is available
    const depth = (frame as any).depth;
    if (!depth || !depth.map) {
      return; // Skip if no depth data
    }

    try {
      this.frameCount++;

      // Get camera pose (identity for now, would come from tracking)
      const cameraPose = Matrix4.identity();

      // Get camera intrinsics
      const cameraIntrinsics = context.camera.getIntrinsics();

      // Integrate depth into mesh
      this.reconstructor.integrateDepth(
        depth.map,
        cameraPose,
        cameraIntrinsics
      );

      // Get latest mesh if available
      const mesh = this.reconstructor.getLastMesh();
      if (mesh) {
        // Add to frame
        frame.mesh = mesh;

        // Emit event
        context.events.emit('mesh:updated', mesh);

        log.debug('Mesh updated', {
          vertices: mesh.vertices.length,
          triangles: mesh.triangles.length,
        });
      }

      // Periodic cleanup
      if (this.frameCount % 300 === 0) {
        const removed = this.reconstructor.prune(0.1);
        if (removed > 0) {
          log.debug(`Pruned ${removed} low-confidence voxels`);
        }
      }
    } catch (error) {
      log.error('Error in mesh reconstruction:', error);
      context.events.emit('error', new ARError(
        'Mesh reconstruction failed',
        ErrorCodes.INITIALIZATION_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
        }
      ));
    }
  }

  protected async onDestroy(context: ARContext): Promise<void> {
    log.info('Destroying mesh reconstruction plugin');
    this.reconstructor?.reset();
    this.reconstructor = undefined;
  }

  /**
   * Get reconstruction statistics
   */
  getStats() {
    if (!this.reconstructor) {
      return null;
    }

    return {
      enabled: this.enabled,
      config: this.config,
      stats: this.reconstructor.getStats(),
    };
  }

  /**
   * Manually extract mesh
   */
  extractMesh() {
    if (!this.reconstructor) {
      throw new ARError(
        'Plugin not initialized',
        ErrorCodes.NOT_INITIALIZED
      );
    }

    return this.reconstructor.extractMesh();
  }

  /**
   * Reset reconstruction
   */
  reset(): void {
    if (this.reconstructor) {
      this.reconstructor.reset();
      this.frameCount = 0;
      log.info('Mesh reconstruction reset');
    }
  }

  /**
   * Set extraction interval
   */
  setExtractionInterval(frames: number): void {
    this.config.extractionInterval = frames;
    if (this.reconstructor) {
      this.reconstructor.setExtractionInterval(frames);
    }
  }
}
