/**
 * Reference Image Store
 * Stores reference images with multi-scale pyramids and precomputed features
 *
 * Features:
 * - Multi-scale pyramid (8 levels)
 * - Precomputed ORB descriptors at each scale
 * - Efficient lookup and matching
 */

import { Logger } from '../../../utils/logger';
import type { Keypoint } from '../../detection/feature-detector';

const log = Logger.create('ReferenceImageStore');

export interface ReferenceImage {
  id: string;
  imageData: ImageData | ImageBitmap;
  physicalWidth?: number; // Real-world size in meters
  physicalHeight?: number;
}

export interface StoredReferenceImage {
  id: string;
  width: number;
  height: number;
  physicalWidth: number;
  physicalHeight: number;
  pyramid: ImagePyramid;
  features: MultiScaleFeatures;
}

export interface ImagePyramid {
  levels: ImageData[];
  scales: number[];
}

export interface MultiScaleFeatures {
  levels: ScaleLevelFeatures[];
}

export interface ScaleLevelFeatures {
  scale: number;
  keypoints: Keypoint[];
  descriptors: Uint8Array[]; // ORB descriptors
}

export class ReferenceImageStore {
  private images: Map<string, StoredReferenceImage> = new Map();
  private readonly pyramidLevels = 8;
  private readonly scaleFactor = 0.8; // Each level is 80% of previous

  /**
   * Add reference image to store
   */
  async addImage(image: ReferenceImage): Promise<void> {
    log.info(`Adding reference image: ${image.id}`);

    // Convert to ImageData if needed
    const imageData = await this.toImageData(image.imageData);

    // Build multi-scale pyramid
    const pyramid = this.buildPyramid(imageData);

    // For now, we'll store the pyramid without computing features
    // Features will be computed on-demand during tracking
    const stored: StoredReferenceImage = {
      id: image.id,
      width: imageData.width,
      height: imageData.height,
      physicalWidth: image.physicalWidth ?? 0.1, // Default 10cm
      physicalHeight:
        image.physicalHeight ??
        (imageData.height / imageData.width) * (image.physicalWidth ?? 0.1),
      pyramid,
      features: {
        levels: pyramid.levels.map((level, i) => ({
          scale: pyramid.scales[i],
          keypoints: [],
          descriptors: [],
        })),
      },
    };

    this.images.set(image.id, stored);
    log.info(`Reference image added: ${image.id} (${stored.width}x${stored.height})`);
  }

  /**
   * Remove reference image
   */
  removeImage(id: string): boolean {
    const removed = this.images.delete(id);
    if (removed) {
      log.info(`Reference image removed: ${id}`);
    }
    return removed;
  }

  /**
   * Get stored reference image
   */
  getImage(id: string): StoredReferenceImage | undefined {
    return this.images.get(id);
  }

  /**
   * Get all stored images
   */
  getAllImages(): StoredReferenceImage[] {
    return Array.from(this.images.values());
  }

  /**
   * Get number of stored images
   */
  getCount(): number {
    return this.images.size;
  }

  /**
   * Clear all stored images
   */
  clear(): void {
    this.images.clear();
    log.info('All reference images cleared');
  }

  /**
   * Build multi-scale pyramid for image
   */
  private buildPyramid(imageData: ImageData): ImagePyramid {
    const levels: ImageData[] = [imageData];
    const scales: number[] = [1.0];

    let currentLevel = imageData;

    for (let i = 1; i < this.pyramidLevels; i++) {
      const scale = Math.pow(this.scaleFactor, i);
      const scaledWidth = Math.floor(imageData.width * scale);
      const scaledHeight = Math.floor(imageData.height * scale);

      if (scaledWidth < 32 || scaledHeight < 32) {
        // Stop if image gets too small
        break;
      }

      const scaledLevel = this.resizeImageData(
        currentLevel,
        scaledWidth,
        scaledHeight
      );
      levels.push(scaledLevel);
      scales.push(scale);

      currentLevel = scaledLevel;
    }

    log.debug(`Built pyramid with ${levels.length} levels`);

    return { levels, scales };
  }

  /**
   * Resize image data (simple bilinear)
   */
  private resizeImageData(
    source: ImageData,
    targetWidth: number,
    targetHeight: number
  ): ImageData {
    const srcWidth = source.width;
    const srcHeight = source.height;
    const srcData = source.data;

    const target = new ImageData(targetWidth, targetHeight);
    const targetData = target.data;

    const xRatio = srcWidth / targetWidth;
    const yRatio = srcHeight / targetHeight;

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const srcX = x * xRatio;
        const srcY = y * yRatio;

        const x1 = Math.floor(srcX);
        const y1 = Math.floor(srcY);
        const x2 = Math.min(x1 + 1, srcWidth - 1);
        const y2 = Math.min(y1 + 1, srcHeight - 1);

        const fx = srcX - x1;
        const fy = srcY - y1;

        const targetIdx = (y * targetWidth + x) * 4;

        // Bilinear interpolation for each channel
        for (let c = 0; c < 4; c++) {
          const idx11 = (y1 * srcWidth + x1) * 4 + c;
          const idx12 = (y1 * srcWidth + x2) * 4 + c;
          const idx21 = (y2 * srcWidth + x1) * 4 + c;
          const idx22 = (y2 * srcWidth + x2) * 4 + c;

          const v1 = srcData[idx11] * (1 - fx) + srcData[idx12] * fx;
          const v2 = srcData[idx21] * (1 - fx) + srcData[idx22] * fx;
          const v = v1 * (1 - fy) + v2 * fy;

          targetData[targetIdx + c] = Math.round(v);
        }
      }
    }

    return target;
  }

  /**
   * Convert ImageBitmap to ImageData
   */
  private async toImageData(
    source: ImageData | ImageBitmap
  ): Promise<ImageData> {
    if (source instanceof ImageData) {
      return source;
    }

    // Create canvas and draw ImageBitmap
    const canvas = new OffscreenCanvas(source.width, source.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    ctx.drawImage(source, 0, 0);
    return ctx.getImageData(0, 0, source.width, source.height);
  }
}
