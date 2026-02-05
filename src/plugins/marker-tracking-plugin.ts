/**
 * Marker Tracking Plugin
 * Example plugin implementation for ArUco marker detection and tracking
 */

import { BaseARPlugin, type ARContext } from '../core/plugin-system';
import { type ARFrame } from '../core/engine';
import { Tracker, type TrackerConfig } from '../core/tracking/tracker';
import { ARError, ErrorCodes } from '../core/errors';
import { Logger } from '../utils/logger';

const log = Logger.create('MarkerTrackingPlugin');

/**
 * Marker tracking plugin configuration
 */
export interface MarkerTrackingConfig {
  /** ArUco dictionary to use */
  dictionary?: 'ARUCO_4X4_50' | 'ARUCO_5X5_100' | 'ARUCO_6X6_250';

  /** Marker size in meters (for pose estimation) */
  markerSize?: number;

  /** Enable temporal filtering */
  enableFiltering?: boolean;

  /** Minimum detection confidence (0-1) */
  minConfidence?: number;

  /** Maximum number of markers to track */
  maxMarkers?: number;
}

/**
 * Marker tracking plugin
 */
export class MarkerTrackingPlugin extends BaseARPlugin {
  readonly name = 'marker-tracking';
  readonly version = '1.0.0';
  readonly priority = 10; // Run early

  private tracker?: Tracker;
  private config: Required<MarkerTrackingConfig>;

  constructor(config: MarkerTrackingConfig = {}) {
    super();

    this.config = {
      dictionary: config.dictionary ?? 'ARUCO_4X4_50',
      markerSize: config.markerSize ?? 0.1, // 10cm default
      enableFiltering: config.enableFiltering ?? true,
      minConfidence: config.minConfidence ?? 0.7,
      maxMarkers: config.maxMarkers ?? 10,
    };
  }

  protected async onInitialize(context: ARContext): Promise<void> {
    log.info('Initializing marker tracking plugin', this.config);

    try {
      // Create tracker with configuration
      // Map dictionary name to size (e.g., ARUCO_4X4_50 -> 4)
      const dictionarySize = this.config.dictionary?.includes('4X4') ? 4 :
        this.config.dictionary?.includes('5X5') ? 5 : 6;

      const trackerConfig: TrackerConfig = {
        markerDetectorConfig: {
          dictionarySize: dictionarySize as 4 | 5 | 6,
          markerSize: this.config.markerSize,
        },
      };

      this.tracker = new Tracker(context.gpuContext || context.gpu, trackerConfig);

      log.info('Marker tracking plugin initialized');
    } catch (error) {
      throw new ARError(
        'Failed to initialize marker tracker',
        ErrorCodes.INITIALIZATION_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  async processFrame(frame: ARFrame, context: ARContext): Promise<void> {
    if (!this.enabled || !this.tracker) {
      return;
    }

    try {
      // Track markers
      const markers = await this.tracker.track(frame.grayscaleTexture);

      // Filter by confidence
      const validMarkers = markers.filter(
        (m) => m.confidence >= this.config.minConfidence
      );

      // Limit number of markers
      const limitedMarkers = validMarkers.slice(0, this.config.maxMarkers);

      // Add to frame
      frame.markers = limitedMarkers;

      // Emit events for each marker
      for (const marker of limitedMarkers) {
        context.events.emit('marker:detected', marker);
      }

      // Check for lost markers (if tracking state is available)
      // ... (would compare with previous frame)

    } catch (error) {
      log.error('Error processing markers:', error);
      context.events.emit('error', new ARError(
        'Marker tracking failed',
        ErrorCodes.MARKER_DETECTION_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
        }
      ));
    }
  }

  protected async onDestroy(context: ARContext): Promise<void> {
    log.info('Destroying marker tracking plugin');
    this.tracker = undefined;
  }

  /**
   * Get current tracking statistics
   */
  getStats() {
    if (!this.tracker) {
      return null;
    }

    return {
      enabled: this.enabled,
      config: this.config,
    };
  }
}
