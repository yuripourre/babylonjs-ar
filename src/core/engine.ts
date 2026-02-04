/**
 * AR Engine - Main Orchestrator
 * Coordinates camera, GPU processing, tracking, and detection
 */

import { GPUContextManager } from './gpu/gpu-context';
import { CameraManager, type CameraConfig } from './camera/camera-manager';
import { ComputePipeline, calculateWorkgroupCount } from './gpu/compute-pipeline';
import { grayscaleShader } from '../shaders/index';

export interface AREngineConfig {
  camera?: CameraConfig;
  gpu?: {
    powerPreference?: 'low-power' | 'high-performance';
  };
}

export interface ARFrame {
  timestamp: number;
  cameraTexture: GPUTexture;
  grayscaleTexture: GPUTexture;
  width: number;
  height: number;
}

export class AREngine {
  private gpuContext: GPUContextManager;
  private cameraManager: CameraManager;
  private isInitialized = false;
  private isRunning = false;

  // GPU resources
  private grayscalePipeline: ComputePipeline | null = null;
  private grayscaleTexture: GPUTexture | null = null;
  private grayscaleBindGroup: GPUBindGroup | null = null;

  // Frame timing
  private frameCount = 0;
  private lastFrameTime = 0;
  private fps = 0;

  // Frame callback
  private onFrameCallback: ((frame: ARFrame) => void) | null = null;

  constructor() {
    this.gpuContext = new GPUContextManager();
    this.cameraManager = new CameraManager();
  }

  /**
   * Initialize the AR engine
   */
  async initialize(config: AREngineConfig = {}): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('[AREngine] Initializing...');

    // Initialize GPU context
    await this.gpuContext.initialize({
      powerPreference: config.gpu?.powerPreference ?? 'high-performance',
    });

    // Initialize camera
    await this.cameraManager.initialize(config.camera);

    // Get camera resolution
    const resolution = this.cameraManager.getResolution();
    if (!resolution) {
      throw new Error('Failed to get camera resolution');
    }

    console.log(`[AREngine] Camera resolution: ${resolution.width}x${resolution.height}`);

    // Initialize GPU pipelines
    await this.initializePipelines(resolution.width, resolution.height);

    this.isInitialized = true;
    console.log('[AREngine] Initialized successfully');
  }

  /**
   * Initialize compute pipelines
   */
  private async initializePipelines(width: number, height: number): Promise<void> {
    const device = this.gpuContext.getDevice();

    // Create grayscale pipeline
    this.grayscalePipeline = new ComputePipeline(this.gpuContext, {
      label: 'Grayscale',
      shaderCode: grayscaleShader,
      entryPoint: 'main',
    });

    // Create grayscale output texture
    this.grayscaleTexture = device.createTexture({
      label: 'Grayscale Output',
      size: { width, height },
      format: 'r8unorm',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    console.log('[AREngine] Pipelines initialized');
  }

  /**
   * Start the AR processing loop
   */
  start(onFrame?: (frame: ARFrame) => void): void {
    if (!this.isInitialized) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      return;
    }

    this.onFrameCallback = onFrame ?? null;
    this.isRunning = true;
    this.lastFrameTime = performance.now();

    console.log('[AREngine] Starting...');
    this.processFrame();
  }

  /**
   * Stop the AR processing loop
   */
  stop(): void {
    this.isRunning = false;
    console.log('[AREngine] Stopped');
  }

  /**
   * Main frame processing loop
   */
  private processFrame = (): void => {
    if (!this.isRunning) {
      return;
    }

    // Get camera frame
    const cameraFrame = this.cameraManager.getCurrentFrame();
    if (!cameraFrame) {
      requestAnimationFrame(this.processFrame);
      return;
    }

    const device = this.gpuContext.getDevice();

    try {
      // Import VideoFrame as external texture (zero-copy)
      const externalTexture = device.importExternalTexture({
        source: cameraFrame.videoFrame,
      });

      // Create bind group for grayscale conversion (if not exists)
      if (!this.grayscaleBindGroup && this.grayscalePipeline && this.grayscaleTexture) {
        this.grayscaleBindGroup = this.grayscalePipeline.createBindGroup(
          [
            { binding: 0, resource: externalTexture },
            { binding: 1, resource: this.grayscaleTexture.createView() },
          ],
          'Grayscale Bind Group'
        );
      }

      // Execute grayscale conversion
      if (this.grayscalePipeline && this.grayscaleBindGroup && this.grayscaleTexture) {
        const workgroupCount = calculateWorkgroupCount(
          cameraFrame.width,
          cameraFrame.height,
          { x: 16, y: 16 }
        );

        // Need to recreate bind group each frame for external texture
        const bindGroup = this.grayscalePipeline.createBindGroup([
          { binding: 0, resource: externalTexture },
          { binding: 1, resource: this.grayscaleTexture.createView() },
        ]);

        this.grayscalePipeline.executeAndSubmit(bindGroup, workgroupCount);
      }

      // Create AR frame data
      const arFrame: ARFrame = {
        timestamp: cameraFrame.timestamp,
        cameraTexture: externalTexture as any, // External texture
        grayscaleTexture: this.grayscaleTexture!,
        width: cameraFrame.width,
        height: cameraFrame.height,
      };

      // Invoke callback
      if (this.onFrameCallback) {
        this.onFrameCallback(arFrame);
      }

      // Update FPS
      this.updateFPS();
    } finally {
      // Clean up VideoFrame
      cameraFrame.videoFrame.close();
    }

    // Continue loop
    requestAnimationFrame(this.processFrame);
  };

  /**
   * Update FPS counter
   */
  private updateFPS(): void {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFrameTime;

    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      console.log(`[AREngine] FPS: ${this.fps}`);
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.fps;
  }

  /**
   * Get GPU context
   */
  getGPUContext(): GPUContextManager {
    return this.gpuContext;
  }

  /**
   * Get camera manager
   */
  getCameraManager(): CameraManager {
    return this.cameraManager;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();

    if (this.grayscaleTexture) {
      this.grayscaleTexture.destroy();
      this.grayscaleTexture = null;
    }

    this.cameraManager.destroy();
    this.gpuContext.destroy();

    this.isInitialized = false;
    console.log('[AREngine] Destroyed');
  }
}
