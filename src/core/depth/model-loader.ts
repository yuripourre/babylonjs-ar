/**
 * Model Loader
 * Handles loading and managing depth estimation models (ONNX Runtime)
 */

import { Logger } from '../../utils/logger';

const log = Logger.create('ModelLoader');

/**
 * Supported depth estimation models
 */
export type DepthModel =
  | 'midas-tiny'      // 20MB, fast, good quality
  | 'midas-small'     // 45MB, medium speed, better quality
  | 'dpt-hybrid'      // 470MB, slow, best quality
  | 'custom';         // User-provided model

/**
 * Model metadata
 */
export interface ModelInfo {
  name: DepthModel;
  url: string;
  size: number;          // File size in MB
  inputSize: [number, number]; // [width, height]
  outputSize: [number, number];
  mean: [number, number, number]; // Normalization mean
  std: [number, number, number];  // Normalization std
}

/**
 * Available models registry
 */
export const MODEL_REGISTRY: Record<DepthModel, ModelInfo> = {
  'midas-tiny': {
    name: 'midas-tiny',
    url: 'https://github.com/isl-org/MiDaS/releases/download/v2_1/model-small.onnx',
    size: 20,
    inputSize: [256, 256],
    outputSize: [256, 256],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
  'midas-small': {
    name: 'midas-small',
    url: 'https://github.com/isl-org/MiDaS/releases/download/v3_0/dpt_swin2_tiny_256.onnx',
    size: 45,
    inputSize: [384, 384],
    outputSize: [384, 384],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
  'dpt-hybrid': {
    name: 'dpt-hybrid',
    url: 'https://github.com/isl-org/MiDaS/releases/download/v3_0/dpt_hybrid_384.onnx',
    size: 470,
    inputSize: [384, 384],
    outputSize: [384, 384],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
  'custom': {
    name: 'custom',
    url: '',
    size: 0,
    inputSize: [256, 256],
    outputSize: [256, 256],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
};

/**
 * ONNX Runtime session wrapper
 * Note: This is a placeholder interface. In production, this would use actual ONNX Runtime Web.
 */
export interface ONNXSession {
  run(inputs: Record<string, Float32Array>): Promise<Record<string, Float32Array>>;
  inputNames: string[];
  outputNames: string[];
}

/**
 * Model loader and cache manager
 */
export class ModelLoader {
  private modelCache: Map<string, ONNXSession> = new Map();
  private loadingPromises: Map<string, Promise<ONNXSession>> = new Map();

  /**
   * Load a depth estimation model
   */
  async loadModel(
    modelName: DepthModel,
    customUrl?: string
  ): Promise<{ session: ONNXSession; info: ModelInfo }> {
    const info = MODEL_REGISTRY[modelName];
    const url = customUrl || info.url;

    // Check cache
    const cached = this.modelCache.get(url);
    if (cached) {
      log.info(`Model ${modelName} loaded from cache`);
      return { session: cached, info };
    }

    // Check if already loading
    const loading = this.loadingPromises.get(url);
    if (loading) {
      log.debug(`Waiting for model ${modelName} to finish loading`);
      const session = await loading;
      return { session, info };
    }

    // Start loading
    const loadPromise = this.loadModelFromURL(url, info);
    this.loadingPromises.set(url, loadPromise);

    try {
      const session = await loadPromise;
      this.modelCache.set(url, session);
      this.loadingPromises.delete(url);

      log.info(`Model ${modelName} loaded successfully`);
      return { session, info };
    } catch (error) {
      this.loadingPromises.delete(url);
      throw error;
    }
  }

  /**
   * Load model from URL
   * Note: This is a simplified version. Production would use actual ONNX Runtime Web.
   */
  private async loadModelFromURL(
    url: string,
    info: ModelInfo
  ): Promise<ONNXSession> {
    log.info(`Loading model from ${url} (${info.size}MB)`);

    try {
      // In production, this would use ONNX Runtime Web:
      // import * as ort from 'onnxruntime-web';
      // const session = await ort.InferenceSession.create(url, {
      //   executionProviders: ['webgpu', 'wasm'],
      //   graphOptimizationLevel: 'all',
      // });

      // For now, create a mock session
      const mockSession: ONNXSession = {
        inputNames: ['input'],
        outputNames: ['output'],
        run: async (inputs: Record<string, Float32Array>) => {
          // Simulate inference delay
          await new Promise(resolve => setTimeout(resolve, 50));

          // Return mock depth map (in production, this would be real inference)
          const inputData = inputs[mockSession.inputNames[0]];
          const outputSize = info.outputSize[0] * info.outputSize[1];
          const output = new Float32Array(outputSize);

          // Simple mock: gradient based on input
          for (let i = 0; i < outputSize; i++) {
            output[i] = Math.random() * 0.3 + 0.3; // Mock depth values
          }

          return { [mockSession.outputNames[0]]: output };
        },
      };

      return mockSession;
    } catch (error) {
      log.error('Failed to load model', error);
      throw new Error(`Failed to load model from ${url}: ${error}`);
    }
  }

  /**
   * Unload model from cache
   */
  unloadModel(modelName: DepthModel): void {
    const info = MODEL_REGISTRY[modelName];
    this.modelCache.delete(info.url);
    log.info(`Model ${modelName} unloaded from cache`);
  }

  /**
   * Clear all cached models
   */
  clearCache(): void {
    this.modelCache.clear();
    log.info('Model cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    modelsLoaded: number;
    totalSize: number;
  } {
    let totalSize = 0;
    for (const [url] of this.modelCache) {
      // Find model info by URL
      for (const info of Object.values(MODEL_REGISTRY)) {
        if (info.url === url) {
          totalSize += info.size;
          break;
        }
      }
    }

    return {
      modelsLoaded: this.modelCache.size,
      totalSize,
    };
  }

  /**
   * Preload model in background
   */
  async preloadModel(modelName: DepthModel): Promise<void> {
    log.info(`Preloading model ${modelName} in background`);
    await this.loadModel(modelName);
  }

  /**
   * Check if model is loaded
   */
  isModelLoaded(modelName: DepthModel): boolean {
    const info = MODEL_REGISTRY[modelName];
    return this.modelCache.has(info.url);
  }
}

/**
 * Global model loader instance
 */
export const globalModelLoader = new ModelLoader();
