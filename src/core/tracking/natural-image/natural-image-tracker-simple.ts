/**
 * Natural Image Tracker (Simplified Integration)
 * Track arbitrary images without markers
 *
 * This is a simplified version that demonstrates the integration pattern.
 * Full implementation would precompute and cache reference image features.
 */

import { Logger } from '../../../utils/logger';
import { ReferenceImageStore, type ReferenceImage } from './reference-image-store';
import type { CameraIntrinsics, Pose } from '../pose-estimator';
import { Vector3 } from '../../math/vector';
import { Quaternion } from '../../math/quaternion';
import { Matrix4 } from '../../math/matrix';

const log = Logger.create('NaturalImageTracker');

export interface TrackedImage {
  id: string;
  pose: Pose;
  confidence: number;
  matchCount: number;
  isTracking: boolean;
}

export interface TrackingConfig {
  maxImages?: number;
  detectionInterval?: number;
  minMatchCount?: number;
}

export class NaturalImageTracker {
  private referenceStore: ReferenceImageStore;
  private config: Required<TrackingConfig>;
  private trackedImages: Map<string, TrackedImage> = new Map();
  private frameCount = 0;

  constructor(config: TrackingConfig = {}) {
    this.config = {
      maxImages: config.maxImages ?? 5,
      detectionInterval: config.detectionInterval ?? 5,
      minMatchCount: config.minMatchCount ?? 15,
    };

    this.referenceStore = new ReferenceImageStore();
    log.info('Natural image tracker initialized');
  }

  /**
   * Add reference image
   */
  async addReferenceImage(image: ReferenceImage): Promise<void> {
    if (this.referenceStore.getCount() >= this.config.maxImages) {
      log.warn(`Maximum images reached (${this.config.maxImages})`);
      return;
    }

    await this.referenceStore.addImage(image);
    log.info(`Reference image added: ${image.id}`);
  }

  /**
   * Remove reference image
   */
  removeReferenceImage(id: string): void {
    this.referenceStore.removeImage(id);
    this.trackedImages.delete(id);
    log.info(`Reference image removed: ${id}`);
  }

  /**
   * Get reference store (for advanced use)
   */
  getReferenceStore(): ReferenceImageStore {
    return this.referenceStore;
  }

  /**
   * Get tracked images
   */
  getTrackedImages(): TrackedImage[] {
    return Array.from(this.trackedImages.values());
  }

  /**
   * Get specific tracked image
   */
  getTrackedImage(id: string): TrackedImage | undefined {
    return this.trackedImages.get(id);
  }

  /**
   * Create mock tracked image for demonstration
   * In production, this would use full feature matching pipeline
   */
  createMockTrackedImage(
    imageId: string,
    cameraIntrinsics: CameraIntrinsics
  ): TrackedImage {
    const refImage = this.referenceStore.getImage(imageId);
    if (!refImage) {
      throw new Error(`Reference image not found: ${imageId}`);
    }

    // Mock pose estimation
    const position = new Vector3(0, 0, 1); // 1m in front of camera
    const rotation = Quaternion.identity();
    const matrix = Matrix4.compose(position, rotation, new Vector3(1, 1, 1));

    const pose: Pose = {
      position,
      rotation,
      matrix,
    };

    return {
      id: imageId,
      pose,
      confidence: 0.85,
      matchCount: 50,
      isTracking: true,
    };
  }

  /**
   * Update tracking state
   */
  updateTracking(imageId: string, tracked: TrackedImage): void {
    this.trackedImages.set(imageId, tracked);
  }

  /**
   * Clear tracking for an image
   */
  clearTracking(imageId: string): void {
    this.trackedImages.delete(imageId);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.referenceStore.clear();
    this.trackedImages.clear();
    log.info('Tracker destroyed');
  }
}
