/**
 * Depth Estimator
 * AI-powered depth estimation from RGB images
 *
 * Features:
 * - Multiple model support (MiDaS Tiny, Small, DPT)
 * - Adaptive quality presets (low/medium/high)
 * - Temporal smoothing
 * - Frame skipping for performance
 * - WebGPU acceleration
 * - Works on any device (no depth sensor required)
 */

import { DepthMap } from './depth-map';
import { ModelLoader, globalModelLoader, type DepthModel, type ModelInfo } from './model-loader';
import { ImagePreprocessor, GPUImagePreprocessor } from './preprocessing';
import { Logger } from '../../utils/logger';

const log = Logger.create('DepthEstimator');

/**
 * Quality presets for depth estimation
 */
export type DepthQuality = 'low' | 'medium' | 'high';

/**
 * Depth estimator configuration
 */
export interface DepthEstimatorConfig {
  model?: DepthModel;                // Which model to use
  quality?: DepthQuality;            // Quality preset
  inferenceInterval?: number;        // Min ms between inferences (throttling)
  temporalSmoothing?: number;        // 0-1, smoothing factor
  minDepth?: number;                 // Minimum depth in meters
  maxDepth?: number;                 // Maximum depth in meters
  useGPUPreprocessing?: boolean;     // Use WebGPU for preprocessing
  autoDownload?: boolean;            // Auto-download model if not cached
}

/**
 * Quality preset configurations
 */
const QUALITY_PRESETS: Record<DepthQuality, Partial<DepthEstimatorConfig>> = {
  low: {
    model: 'midas-tiny',
    inferenceInterval: 200,        // 5 fps
    temporalSmoothing: 0.9,        // Heavy smoothing
    useGPUPreprocessing: false,
  },
  medium: {
    model: 'midas-tiny',
    inferenceInterval: 100,        // 10 fps
    temporalSmoothing: 0.8,
    useGPUPreprocessing: true,
  },
  high: {
    model: 'midas-small',
    inferenceInterval: 66,         // 15 fps
    temporalSmoothing: 0.7,
    useGPUPreprocessing: true,
  },
};

/**
 * Main depth estimator class
 */
export class DepthEstimator {
  private config: Required<DepthEstimatorConfig>;
  private modelLoader: ModelLoader;
  private preprocessor: ImagePreprocessor;
  private gpuPreprocessor: GPUImagePreprocessor | null = null;

  // Model state
  private modelSession: any = null;  // ONNXSession
  private modelInfo: ModelInfo | null = null;
  private isModelLoaded = false;

  // Inference state
  private lastDepthMap: DepthMap | null = null;
  private lastInferenceTime = 0;
  private isInferring = false;

  // Statistics
  private inferenceCount = 0;
  private totalInferenceTime = 0;

  constructor(config: DepthEstimatorConfig = {}) {
    // Apply quality preset if specified
    const presetConfig = config.quality
      ? { ...QUALITY_PRESETS[config.quality], ...config }
      : config;

    this.config = {
      model: presetConfig.model ?? 'midas-tiny',
      quality: presetConfig.quality ?? 'medium',
      inferenceInterval: presetConfig.inferenceInterval ?? 100,
      temporalSmoothing: presetConfig.temporalSmoothing ?? 0.8,
      minDepth: presetConfig.minDepth ?? 0.1,
      maxDepth: presetConfig.maxDepth ?? 10.0,
      useGPUPreprocessing: presetConfig.useGPUPreprocessing ?? false,
      autoDownload: presetConfig.autoDownload ?? true,
    };

    this.modelLoader = globalModelLoader;
    this.preprocessor = new ImagePreprocessor();

    log.info('Depth estimator initialized', {
      model: this.config.model,
      quality: this.config.quality,
      inferenceInterval: this.config.inferenceInterval,
    });
  }

  /**
   * Initialize depth estimator (load model)
   */
  async initialize(gpuDevice?: GPUDevice): Promise<void> {
    if (this.isModelLoaded) {
      log.warn('Depth estimator already initialized');
      return;
    }

    // Load model
    log.info(`Loading depth model: ${this.config.model}`);
    const { session, info } = await this.modelLoader.loadModel(this.config.model);

    this.modelSession = session;
    this.modelInfo = info;
    this.isModelLoaded = true;

    // Initialize GPU preprocessor if requested
    if (this.config.useGPUPreprocessing && gpuDevice) {
      this.gpuPreprocessor = new GPUImagePreprocessor();
      await this.gpuPreprocessor.initialize(gpuDevice);
      log.info('GPU preprocessing enabled');
    }

    log.info('Depth estimator ready', {
      model: info.name,
      inputSize: info.inputSize,
      outputSize: info.outputSize,
    });
  }

  /**
   * Estimate depth from frame
   */
  async estimateDepth(
    frame: VideoFrame | HTMLVideoElement | ImageBitmap | HTMLCanvasElement,
    options: {
      skipIfBusy?: boolean;
      forceUpdate?: boolean;
    } = {}
  ): Promise<DepthMap | null> {
    if (!this.isModelLoaded || !this.modelInfo) {
      throw new Error('Depth estimator not initialized. Call initialize() first.');
    }

    const now = performance.now();

    // Check if we should skip this frame
    if (!options.forceUpdate) {
      // Skip if already inferring
      if (options.skipIfBusy && this.isInferring) {
        return this.lastDepthMap;
      }

      // Skip if within throttle interval
      if (now - this.lastInferenceTime < this.config.inferenceInterval) {
        return this.lastDepthMap;
      }
    }

    this.isInferring = true;
    const startTime = performance.now();

    try {
      // Preprocess image
      const inputTensor = await this.preprocessor.preprocess(frame, this.modelInfo);

      // Run inference
      const outputTensor = await this.runInference(inputTensor);

      // Postprocess output
      const [outWidth, outHeight] = this.modelInfo.outputSize;
      const depthData = this.preprocessor.postprocess(
        outputTensor,
        outWidth,
        outHeight
      );

      // Apply temporal smoothing
      let smoothedData = depthData;
      if (this.lastDepthMap && this.config.temporalSmoothing > 0) {
        const prevData = this.lastDepthMap.data;
        smoothedData = this.preprocessor.temporalSmooth(
          depthData,
          prevData,
          1 - this.config.temporalSmoothing
        );
      }

      // Create depth map
      const depthMap = new DepthMap(outWidth, outHeight, smoothedData, {
        minDepth: this.config.minDepth,
        maxDepth: this.config.maxDepth,
        confidence: 0.85, // AI estimation confidence
        timestamp: now,
      });

      // Update state
      this.lastDepthMap = depthMap;
      this.lastInferenceTime = now;
      this.inferenceCount++;
      this.totalInferenceTime += performance.now() - startTime;

      log.debug(`Depth estimated in ${(performance.now() - startTime).toFixed(1)}ms`);

      return depthMap;
    } catch (error) {
      log.error('Depth estimation failed', error);
      return this.lastDepthMap;
    } finally {
      this.isInferring = false;
    }
  }

  /**
   * Run model inference
   */
  private async runInference(inputTensor: Float32Array): Promise<Float32Array> {
    if (!this.modelSession) {
      throw new Error('Model not loaded');
    }

    // Run inference through ONNX session
    const inputName = this.modelSession.inputNames[0];
    const outputName = this.modelSession.outputNames[0];

    const outputs = await this.modelSession.run({
      [inputName]: inputTensor,
    });

    return outputs[outputName];
  }

  /**
   * Get last estimated depth map (cached)
   */
  getLastDepthMap(): DepthMap | null {
    return this.lastDepthMap;
  }

  /**
   * Check if currently inferring
   */
  isBusy(): boolean {
    return this.isInferring;
  }

  /**
   * Get inference statistics
   */
  getStats(): {
    inferenceCount: number;
    averageInferenceTime: number;
    lastInferenceTime: number;
    fps: number;
  } {
    const avgTime = this.inferenceCount > 0
      ? this.totalInferenceTime / this.inferenceCount
      : 0;

    const fps = avgTime > 0 ? 1000 / avgTime : 0;

    return {
      inferenceCount: this.inferenceCount,
      averageInferenceTime: avgTime,
      lastInferenceTime: performance.now() - this.lastInferenceTime,
      fps,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.inferenceCount = 0;
    this.totalInferenceTime = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DepthEstimatorConfig>): void {
    Object.assign(this.config, config);
    log.debug('Configuration updated', config);
  }

  /**
   * Switch to different model
   */
  async switchModel(model: DepthModel): Promise<void> {
    log.info(`Switching to model: ${model}`);

    const { session, info } = await this.modelLoader.loadModel(model);
    this.modelSession = session;
    this.modelInfo = info;
    this.config.model = model;

    // Reset temporal smoothing
    this.lastDepthMap = null;

    log.info('Model switched successfully');
  }

  /**
   * Preload model in background
   */
  static async preloadModel(model: DepthModel): Promise<void> {
    await globalModelLoader.preloadModel(model);
  }

  /**
   * Check if depth estimation is supported
   */
  static isSupported(): boolean {
    // Check for required APIs
    if (typeof document === 'undefined') {
      return false;
    }

    // Check for Canvas API
    if (!document.createElement) {
      return false;
    }

    // In production, would check for ONNX Runtime support
    return true;
  }

  /**
   * Get recommended quality for device
   */
  static getRecommendedQuality(): DepthQuality {
    // Simple heuristic based on available memory
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      const availableMB = memory.jsHeapSizeLimit / (1024 * 1024);

      if (availableMB > 1000) return 'high';
      if (availableMB > 500) return 'medium';
    }

    // Default to medium
    return 'medium';
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.preprocessor.destroy();
    this.gpuPreprocessor?.destroy();

    this.modelSession = null;
    this.modelInfo = null;
    this.isModelLoaded = false;
    this.lastDepthMap = null;

    log.info('Depth estimator destroyed');
  }
}
