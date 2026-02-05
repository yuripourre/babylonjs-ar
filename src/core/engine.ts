/**
 * AR Engine - Plugin-Based Architecture
 * Main orchestrator using plugin system, events, and proper error handling
 */

import { TypedEventEmitter, type AREvents } from './events';
import { ARError, ARErrors, ErrorCodes } from './errors';
import { PluginManager, type ARPlugin, type ARContext } from './plugin-system';
import { GPUContextManager } from './gpu/gpu-context';
import { CameraManager, type CameraConfig } from './camera/camera-manager';
import { ComputePipeline, calculateWorkgroupCount } from './gpu/compute-pipeline';
import { grayscaleShader } from '../shaders/index';
import { Logger } from '../utils/logger';

const log = Logger.create('AREngine');

/**
 * AR Frame
 */
export interface ARFrame {
  timestamp: number;
  cameraTexture: GPUTexture | GPUExternalTexture;
  grayscaleTexture: GPUTexture;
  width: number;
  height: number;
  [key: string]: unknown; // Plugins can extend
}

/**
 * AR Engine configuration
 */
export interface AREngineConfig {
  camera?: CameraConfig;
  gpu?: {
    powerPreference?: 'low-power' | 'high-performance';
  };
}

/**
 * AR Engine - Main orchestrator
 *
 * @example
 * ```typescript
 * import { AREngine, MarkerTrackingPlugin, DepthEstimationPlugin } from 'babylonjs-ar';
 *
 * const ar = new AREngine()
 *   .use(new MarkerTrackingPlugin())
 *   .use(new DepthEstimationPlugin({ quality: 'medium' }));
 *
 * ar.on('marker:detected', (marker) => {
 *   console.log('Marker found:', marker.id);
 * });
 *
 * await ar.initialize();
 * await ar.start();
 * ```
 */
export class AREngine extends TypedEventEmitter<AREvents> {
  private gpuContext: GPUContextManager;
  private cameraManager: CameraManager;
  private pluginManager: PluginManager;

  private config: AREngineConfig = {};
  private context?: ARContext;

  private isInitialized = false;
  private isRunning = false;

  // GPU resources
  private grayscalePipeline?: ComputePipeline;
  private grayscaleTexture?: GPUTexture;
  private grayscaleBindGroup?: GPUBindGroup;

  // Frame timing
  private frameCount = 0;
  private lastFrameTime = 0;
  private fps = 0;
  private animationFrameId?: number;

  // Shared state between plugins
  private sharedState = new Map<string, unknown>();

  constructor() {
    super();

    this.gpuContext = new GPUContextManager();
    this.cameraManager = new CameraManager();
    this.pluginManager = new PluginManager();

    log.info('AREngine created');
  }

  /**
   * Register a plugin
   */
  use(plugin: ARPlugin): this {
    if (this.isInitialized) {
      throw new ARError(
        'Cannot add plugins after initialization',
        ErrorCodes.INVALID_STATE,
        {
          context: { pluginName: plugin.name },
        }
      );
    }

    this.pluginManager.register(plugin);
    log.info(`Plugin registered: ${plugin.name}`);

    return this;
  }

  /**
   * Initialize AR engine
   */
  async initialize(config: AREngineConfig = {}): Promise<void> {
    if (this.isInitialized) {
      throw new ARError(
        'AR engine already initialized',
        ErrorCodes.ALREADY_INITIALIZED
      );
    }

    this.config = config;

    try {
      log.info('Initializing AR engine...');

      // Check WebGPU support
      if (!navigator.gpu) {
        throw ARErrors.webGPUUnavailable();
      }

      // Initialize GPU context
      await this.gpuContext.initialize({
        powerPreference: config.gpu?.powerPreference ?? 'high-performance',
      });

      log.info('GPU context initialized');

      // Initialize camera
      await this.cameraManager.initialize(config.camera);
      log.info('Camera initialized');

      // Setup grayscale pipeline
      await this.setupGrayscalePipeline();
      log.info('Grayscale pipeline created');

      // Create AR context for plugins
      const resolution = this.cameraManager.getResolution();
      if (!resolution) {
        throw new ARError('Failed to get camera resolution', ErrorCodes.INITIALIZATION_FAILED);
      }

      this.context = {
        gpu: this.gpuContext.device,
        gpuContext: this.gpuContext,
        camera: {
          getFrame: async () => {
            const frame = this.cameraManager.getCurrentFrame();
            if (!frame) {
              throw new ARError('No camera frame available', ErrorCodes.INITIALIZATION_FAILED);
            }
            return frame.videoFrame;
          },
          getIntrinsics: () => ({
            fx: 500,
            fy: 500,
            cx: resolution.width / 2,
            cy: resolution.height / 2,
            width: resolution.width,
            height: resolution.height,
          }),
        },
        events: this,
        config: this.config as Record<string, unknown>,
        state: this.sharedState,
      };

      // Initialize all plugins
      await this.pluginManager.initialize(this.context!);
      log.info('Plugins initialized', {
        count: this.pluginManager.getStats().totalPlugins,
      });

      this.isInitialized = true;
      this.emit('ready');

      log.info('AR engine initialized successfully');
    } catch (error) {
      const arError = error instanceof ARError
        ? error
        : new ARError(
            'Initialization failed',
            ErrorCodes.INITIALIZATION_FAILED,
            { cause: error instanceof Error ? error : undefined }
          );

      this.emit('error', arError);
      throw arError;
    }
  }

  /**
   * Start AR processing
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw ARErrors.notInitialized('AREngine');
    }

    if (this.isRunning) {
      log.warn('AR engine already running');
      return;
    }

    log.info('Starting AR engine');

    this.isRunning = true;
    this.emit('start');

    // Start frame loop
    this.processFrame();
  }

  /**
   * Stop AR processing
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    log.info('Stopping AR engine');

    this.isRunning = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }

    this.emit('stop');
  }

  /**
   * Destroy AR engine and cleanup resources
   */
  async destroy(): Promise<void> {
    log.info('Destroying AR engine');

    this.stop();

    if (this.context) {
      await this.pluginManager.destroy(this.context);
    }

    // Cleanup GPU resources
    this.grayscaleTexture?.destroy();
    // Note: ComputePipeline doesn't need explicit cleanup

    this.isInitialized = false;
    this.emit('destroy');

    log.info('AR engine destroyed');
  }

  /**
   * Get plugin by name
   */
  getPlugin<T extends ARPlugin>(name: string): T | undefined {
    return this.pluginManager.get(name) as T | undefined;
  }

  /**
   * Check if engine is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if engine is running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.fps;
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      fps: this.fps,
      frameCount: this.frameCount,
      plugins: this.pluginManager.getStats(),
    };
  }

  /**
   * Main frame processing loop
   */
  private processFrame = async (): Promise<void> => {
    if (!this.isRunning || !this.context) {
      return;
    }

    const timestamp = performance.now();

    this.emit('frame:before', timestamp);

    try {
      // Get camera frame
      const cameraFrame = this.cameraManager.getCurrentFrame();
      if (!cameraFrame) {
        this.animationFrameId = requestAnimationFrame(this.processFrame);
        return;
      }

      // Import video frame to GPU
      const cameraTexture = await this.gpuContext.importVideoFrame(cameraFrame.videoFrame);

      // Convert to grayscale
      const grayscaleTexture = await this.convertToGrayscale(cameraTexture);

      const resolution = this.cameraManager.getResolution()!;

      // Create AR frame
      const frame: ARFrame = {
        timestamp,
        cameraTexture,
        grayscaleTexture,
        width: resolution.width,
        height: resolution.height,
      };

      // Process frame through all plugins
      await this.pluginManager.processFrame(frame, this.context);

      // Emit frame event
      this.emit('frame', frame);
      this.emit('frame:after', frame);

      // Update FPS
      this.updateFPS(timestamp);
    } catch (error) {
      log.error('Error processing frame:', error);

      const arError = error instanceof ARError
        ? error
        : new ARError(
            'Frame processing failed',
            ErrorCodes.INITIALIZATION_FAILED,
            { cause: error instanceof Error ? error : undefined }
          );

      this.emit('error', arError);
    }

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.processFrame);
  };

  /**
   * Setup grayscale conversion pipeline
   */
  private async setupGrayscalePipeline(): Promise<void> {
    const device = this.gpuContext.device;
    const resolution = this.cameraManager.getResolution();
    if (!resolution) {
      throw new ARError('Failed to get camera resolution', ErrorCodes.INITIALIZATION_FAILED);
    }
    const { width, height } = resolution;

    // Create grayscale texture
    this.grayscaleTexture = device.createTexture({
      size: [width, height, 1],
      format: 'r8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Create compute pipeline
    this.grayscalePipeline = new ComputePipeline(
      this.gpuContext,
      {
        shaderCode: grayscaleShader,
        entryPoint: 'grayscale',
        label: 'Grayscale Conversion',
      }
    );

    log.debug('Grayscale pipeline created');
  }

  /**
   * Convert camera texture to grayscale
   */
  private async convertToGrayscale(
    cameraTexture: GPUTexture | GPUExternalTexture
  ): Promise<GPUTexture> {
    if (!this.grayscalePipeline || !this.grayscaleTexture) {
      throw new ARError(
        'Grayscale pipeline not initialized',
        ErrorCodes.NOT_INITIALIZED
      );
    }

    const device = this.gpuContext.device;
    const resolution = this.cameraManager.getResolution()!;
    const { width, height } = resolution;

    // Create/update bind group
    if (!this.grayscaleBindGroup) {
      this.grayscaleBindGroup = device.createBindGroup({
        layout: this.grayscalePipeline.getBindGroupLayout(),
        entries: [
          {
            binding: 0,
            resource:
              'importExternalTexture' in device
                ? (device as any).importExternalTexture({ source: cameraTexture })
                : (cameraTexture as GPUTexture).createView(),
          },
          {
            binding: 1,
            resource: this.grayscaleTexture.createView(),
          },
        ],
      });
    }

    // Dispatch compute shader
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    passEncoder.setPipeline(this.grayscalePipeline.getPipeline());
    passEncoder.setBindGroup(0, this.grayscaleBindGroup);
    const workgroups = calculateWorkgroupCount(width, height, { x: 8, y: 8 });
    passEncoder.dispatchWorkgroups(workgroups.x, workgroups.y, 1);

    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    return this.grayscaleTexture;
  }

  /**
   * Update FPS calculation
   */
  private updateFPS(timestamp: number): void {
    this.frameCount++;

    const elapsed = timestamp - this.lastFrameTime;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFrameTime = timestamp;

      this.emit('fps:change', this.fps);
    }
  }
}
