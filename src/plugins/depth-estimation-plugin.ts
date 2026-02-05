/**
 * Depth Estimation Plugin
 * AI-powered depth estimation from RGB camera frames
 */

import { BaseARPlugin, type ARContext } from '../core/plugin-system';
import { type ARFrame } from '../core/engine';
import { DepthEstimator, type DepthQuality } from '../core/depth/depth-estimator';
import { ARError, ErrorCodes } from '../core/errors';
import { Logger } from '../utils/logger';

const log = Logger.create('DepthEstimationPlugin');

/**
 * Depth estimation plugin configuration
 */
export interface DepthEstimationConfig {
  /** Quality preset */
  quality?: DepthQuality;

  /** Inference interval in ms (throttling) */
  inferenceInterval?: number;

  /** Enable temporal smoothing */
  enableSmoothing?: boolean;

  /** Smoothing factor (0-1) */
  smoothingFactor?: number;
}

/**
 * Depth estimation plugin
 */
export class DepthEstimationPlugin extends BaseARPlugin {
  readonly name = 'depth-estimation';
  readonly version = '1.0.0';
  readonly priority = 50; // Run after markers/planes

  private estimator?: DepthEstimator;
  private config: Required<DepthEstimationConfig>;
  private lastInferenceTime = 0;

  constructor(config: DepthEstimationConfig = {}) {
    super();

    this.config = {
      quality: config.quality ?? 'medium',
      inferenceInterval: config.inferenceInterval ?? 100, // 10 FPS
      enableSmoothing: config.enableSmoothing ?? true,
      smoothingFactor: config.smoothingFactor ?? 0.8,
    };
  }

  protected async onInitialize(context: ARContext): Promise<void> {
    log.info('Initializing depth estimation plugin', this.config);

    try {
      // Create depth estimator
      this.estimator = new DepthEstimator({
        quality: this.config.quality,
        inferenceInterval: this.config.inferenceInterval,
        temporalSmoothing: this.config.smoothingFactor,
      });

      // Initialize with GPU device
      await this.estimator.initialize(context.gpu);

      log.info('Depth estimation plugin initialized');
    } catch (error) {
      throw new ARError(
        'Failed to initialize depth estimator',
        ErrorCodes.INITIALIZATION_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            quality: this.config.quality,
          },
        }
      );
    }
  }

  async processFrame(frame: ARFrame, context: ARContext): Promise<void> {
    if (!this.enabled || !this.estimator) {
      return;
    }

    // Throttle inference
    const now = performance.now();
    if (now - this.lastInferenceTime < this.config.inferenceInterval) {
      return;
    }

    try {
      // Get camera frame
      const cameraFrame = await context.camera.getFrame();

      // Estimate depth
      const depthMap = await this.estimator.estimateDepth(cameraFrame);

      if (depthMap) {
        this.lastInferenceTime = now;

        // Add to frame
        frame.depth = {
          map: depthMap,
          timestamp: now,
        };

        // Emit event
        context.events.emit('depth:available', depthMap);

        log.debug('Depth estimation complete', {
          size: `${depthMap.width}x${depthMap.height}`,
          range: `${depthMap.minDepth.toFixed(2)}-${depthMap.maxDepth.toFixed(2)}m`,
        });
      }
    } catch (error) {
      log.error('Error estimating depth:', error);
      context.events.emit('error', new ARError(
        'Depth estimation failed',
        ErrorCodes.MODEL_INFERENCE_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
        }
      ));
    }
  }

  protected async onDestroy(context: ARContext): Promise<void> {
    log.info('Destroying depth estimation plugin');
    this.estimator = undefined;
  }

  /**
   * Get depth estimation statistics
   */
  getStats() {
    if (!this.estimator) {
      return null;
    }

    return {
      enabled: this.enabled,
      config: this.config,
      stats: this.estimator.getStats(),
    };
  }

  /**
   * Change quality at runtime
   */
  async setQuality(quality: DepthQuality): Promise<void> {
    if (!this.estimator || !this.context) {
      throw new ARError(
        'Plugin not initialized',
        ErrorCodes.NOT_INITIALIZED
      );
    }

    this.config.quality = quality;

    // Recreate estimator with new quality
    this.estimator = new DepthEstimator({
      quality: quality,
      inferenceInterval: this.config.inferenceInterval,
      temporalSmoothing: this.config.smoothingFactor,
    });

    await this.estimator.initialize(this.context.gpu);

    log.info('Depth quality changed', { quality });
  }
}
