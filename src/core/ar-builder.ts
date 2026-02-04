/**
 * AR Engine Builder
 * Fluent API for easy configuration and setup
 * Developer Experience Enhancement
 */

import { AREngine, type AREngineConfig } from './engine';
import { AdaptiveQuality } from '../utils/adaptive-quality';
import { TemporalCoherence } from '../utils/temporal-coherence';
import type { DetectedMarker } from './detection/marker-detector';
import type { DetectedPlane } from './detection/plane-detector';
import type { TrackedMarker } from './tracking/tracker';
import type { ARFrame } from './engine';

export type ARPreset = 'mobile' | 'desktop' | 'high-quality' | 'low-latency' | 'battery-saver';

export interface AREventHandlers {
  onReady?: () => void;
  onFrame?: (frame: ARFrame) => void;
  onMarkerDetected?: (marker: DetectedMarker) => void;
  onMarkerLost?: (markerId: number) => void;
  onPlaneDetected?: (plane: DetectedPlane) => void;
  onPlaneUpdated?: (plane: DetectedPlane) => void;
  onError?: (error: Error) => void;
  onFPSChange?: (fps: number) => void;
}

/**
 * Fluent builder for AR Engine configuration
 *
 * @example
 * ```typescript
 * const ar = await ARBuilder
 *   .preset('mobile')
 *   .enableMarkers()
 *   .enablePlanes()
 *   .onMarkerDetected(marker => console.log('Found:', marker.id))
 *   .build();
 * ```
 */
export class ARBuilder {
  private config: AREngineConfig = {};
  private handlers: AREventHandlers = {};
  private useAdaptiveQuality = true;
  private useTemporalCoherence = true;
  private shouldAutoStart = true;

  /**
   * Create builder with preset configuration
   */
  static preset(preset: ARPreset): ARBuilder {
    const builder = new ARBuilder();
    builder.applyPreset(preset);
    return builder;
  }

  /**
   * Create quick AR instance with minimal config
   * Perfect for prototyping and simple use cases
   */
  static async createQuick(options?: {
    markers?: boolean;
    planes?: boolean;
    onFrame?: (frame: ARFrame) => void;
  }): Promise<AREngine> {
    const builder = ARBuilder.preset('desktop')
      .onFrame(options?.onFrame || (() => {}));

    if (options?.markers) builder.enableMarkers();
    if (options?.planes) builder.enablePlanes();

    return builder.build();
  }

  /**
   * Apply preset configuration
   */
  private applyPreset(preset: ARPreset): this {
    const presets: Record<ARPreset, AREngineConfig> = {
      mobile: {
        camera: {
          width: 640,
          height: 480,
          facingMode: 'environment',
          frameRate: 30,
        },
        gpu: {
          powerPreference: 'low-power',
        },
        tracker: {},
        planeDetector: {
          ransacIterations: 128,
          minInliers: 100,
        },
      },
      desktop: {
        camera: {
          width: 1280,
          height: 720,
          facingMode: 'environment',
          frameRate: 60,
        },
        gpu: {
          powerPreference: 'high-performance',
        },
        tracker: {},
        planeDetector: {
          ransacIterations: 256,
          minInliers: 150,
        },
      },
      'high-quality': {
        camera: {
          width: 1920,
          height: 1080,
          facingMode: 'environment',
          frameRate: 60,
        },
        gpu: {
          powerPreference: 'high-performance',
        },
        tracker: {},
        planeDetector: {
          ransacIterations: 512,
          minInliers: 200,
        },
      },
      'low-latency': {
        camera: {
          width: 640,
          height: 480,
          facingMode: 'environment',
          frameRate: 120,
        },
        gpu: {
          powerPreference: 'high-performance',
        },
        tracker: {},
        planeDetector: {
          ransacIterations: 64,
          minInliers: 50,
        },
      },
      'battery-saver': {
        camera: {
          width: 480,
          height: 360,
          facingMode: 'environment',
          frameRate: 15,
        },
        gpu: {
          powerPreference: 'low-power',
        },
        tracker: {},
        planeDetector: {
          ransacIterations: 64,
          minInliers: 50,
        },
      },
    };

    this.config = presets[preset];
    return this;
  }

  /**
   * Configure camera settings
   */
  camera(settings: {
    width?: number;
    height?: number;
    frameRate?: number;
    facingMode?: 'user' | 'environment';
  }): this {
    this.config.camera = {
      ...this.config.camera,
      ...settings,
    };
    return this;
  }

  /**
   * Configure GPU settings
   */
  gpu(settings: { powerPreference?: 'low-power' | 'high-performance' }): this {
    this.config.gpu = {
      ...this.config.gpu,
      ...settings,
    };
    return this;
  }

  /**
   * Enable marker tracking
   */
  enableMarkers(config?: {
    dictionarySize?: 4 | 5 | 6;
    markerSize?: number;
    minMarkerPerimeter?: number;
  }): this {
    this.config.enableMarkerTracking = true;
    // Config would be applied to MarkerDetector separately
    return this;
  }

  /**
   * Enable plane detection
   */
  enablePlanes(config?: {
    ransacIterations?: number;
    minInliers?: number;
    distanceThreshold?: number;
  }): this {
    this.config.enablePlaneDetection = true;
    if (config) {
      this.config.planeDetector = {
        ...this.config.planeDetector,
        ...config,
      };
    }
    return this;
  }

  /**
   * Enable/disable adaptive quality
   */
  adaptiveQuality(enabled: boolean): this {
    this.useAdaptiveQuality = enabled;
    return this;
  }

  /**
   * Enable/disable temporal coherence
   */
  temporalCoherence(enabled: boolean): this {
    this.useTemporalCoherence = enabled;
    return this;
  }

  /**
   * Set whether to auto-start after build
   */
  autoStart(enabled: boolean): this {
    this.shouldAutoStart = enabled;
    return this;
  }

  /**
   * Register event handler for when engine is ready
   */
  onReady(handler: () => void): this {
    this.handlers.onReady = handler;
    return this;
  }

  /**
   * Register frame callback
   */
  onFrame(handler: (frame: ARFrame) => void): this {
    this.handlers.onFrame = handler;
    return this;
  }

  /**
   * Register marker detected handler
   */
  onMarkerDetected(handler: (marker: DetectedMarker) => void): this {
    this.handlers.onMarkerDetected = handler;
    return this;
  }

  /**
   * Register marker lost handler
   */
  onMarkerLost(handler: (markerId: number) => void): this {
    this.handlers.onMarkerLost = handler;
    return this;
  }

  /**
   * Register plane detected handler
   */
  onPlaneDetected(handler: (plane: DetectedPlane) => void): this {
    this.handlers.onPlaneDetected = handler;
    return this;
  }

  /**
   * Register plane updated handler
   */
  onPlaneUpdated(handler: (plane: DetectedPlane) => void): this {
    this.handlers.onPlaneUpdated = handler;
    return this;
  }

  /**
   * Register error handler
   */
  onError(handler: (error: Error) => void): this {
    this.handlers.onError = handler;
    return this;
  }

  /**
   * Register FPS change handler
   */
  onFPSChange(handler: (fps: number) => void): this {
    this.handlers.onFPSChange = handler;
    return this;
  }

  /**
   * Build and initialize AR Engine
   */
  async build(): Promise<AREngine> {
    try {
      // Check WebGPU support
      if (!navigator.gpu) {
        throw new Error(
          'WebGPU is not supported. Please use Chrome 113+, Edge 113+, or Safari 18+'
        );
      }

      // Create engine
      const engine = new AREngine();

      // Initialize with config
      await engine.initialize(this.config);

      // Setup adaptive quality if enabled
      if (this.useAdaptiveQuality) {
        const quality = new AdaptiveQuality(
          this.config.camera?.frameRate || 60,
          AdaptiveQuality.detectPlatformQuality()
        );

        // Hook into engine to apply quality settings
        // (This would require engine modifications to support)
      }

      // Setup temporal coherence if enabled
      if (this.useTemporalCoherence) {
        const temporal = new TemporalCoherence();
        // Hook into engine
        // (This would require engine modifications to support)
      }

      // Attach event handlers
      if (this.handlers.onFrame) {
        engine.start(this.handlers.onFrame);
      }

      // Call ready handler
      if (this.handlers.onReady) {
        this.handlers.onReady();
      }

      // Auto-start if enabled
      if (this.shouldAutoStart && !this.handlers.onFrame) {
        engine.start(() => {}); // Start with empty callback
      }

      return engine;
    } catch (error) {
      if (this.handlers.onError) {
        this.handlers.onError(error as Error);
      }
      throw error;
    }
  }
}
