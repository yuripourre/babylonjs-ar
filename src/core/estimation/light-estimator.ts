/**
 * Light Estimator
 * Estimates scene lighting using spherical harmonics
 */

import type { GPUContextManager } from '../gpu/gpu-context';
import { ComputePipeline } from '../gpu/compute-pipeline';
import { Vector3 } from '../math/vector';

export interface LightEstimate {
  // Spherical harmonics coefficients (L2, 9 bands)
  shCoefficients: Float32Array; // 9 x RGB = 27 floats

  // Dominant light direction
  dominantDirection: Vector3;

  // Average ambient color
  ambientColor: [number, number, number];

  // Average intensity
  intensity: number;

  // Color temperature (estimated)
  colorTemperature: number;

  timestamp: number;
}

export interface LightEstimatorConfig {
  updateInterval?: number; // ms, default 500
  smoothingFactor?: number; // 0-1, default 0.3
}

export class LightEstimator {
  private gpuContext: GPUContextManager;
  private config: Required<LightEstimatorConfig>;

  // Pipelines
  private shPipeline: ComputePipeline | null = null;
  private normalizePipeline: ComputePipeline | null = null;
  private extractLightPipeline: ComputePipeline | null = null;

  // Buffers
  private shCoefficientsBuffer: GPUBuffer | null = null;
  private shParamsBuffer: GPUBuffer | null = null;

  // Double-buffered readback for async operation
  private shReadbackBuffers: [GPUBuffer | null, GPUBuffer | null] = [null, null];
  private currentReadbackIndex = 0;

  // State
  private currentEstimate: LightEstimate | null = null;
  private lastUpdateTime = 0;
  private pendingReadback: Promise<LightEstimate | null> | null = null;

  constructor(gpuContext: GPUContextManager, config: LightEstimatorConfig = {}) {
    this.gpuContext = gpuContext;
    this.config = {
      updateInterval: config.updateInterval ?? 500,
      smoothingFactor: config.smoothingFactor ?? 0.3,
    };
  }

  /**
   * Initialize light estimator
   */
  async initialize(): Promise<void> {
    const device = this.gpuContext.getDevice();

    // Load SH shader
    const shShader = await this.loadShader();

    // Create pipelines
    this.shPipeline = new ComputePipeline(this.gpuContext, {
      label: 'SH Computation',
      shaderCode: shShader,
      entryPoint: 'main',
    });

    this.normalizePipeline = new ComputePipeline(this.gpuContext, {
      label: 'SH Normalization',
      shaderCode: shShader,
      entryPoint: 'normalize',
    });

    this.extractLightPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Light Extraction',
      shaderCode: shShader,
      entryPoint: 'extractDominantLight',
    });

    // Create buffers
    // 9 SH coefficients + 2 extra for direction/intensity
    // Each stored across 100 workgroups for parallel reduction
    const coeffBufferSize = 11 * 100 * 16; // vec4<f32> per slot

    this.shCoefficientsBuffer = device.createBuffer({
      label: 'SH Coefficients',
      size: coeffBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.shParamsBuffer = device.createBuffer({
      label: 'SH Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create double-buffered readback buffers
    this.shReadbackBuffers[0] = device.createBuffer({
      label: 'SH Readback 0',
      size: coeffBufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    this.shReadbackBuffers[1] = device.createBuffer({
      label: 'SH Readback 1',
      size: coeffBufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    console.log('[LightEstimator] Initialized with double-buffered readback');
  }

  /**
   * Load shader code
   */
  private async loadShader(): Promise<string> {
    // Placeholder - in real implementation would import from WGSL file
    return `
      @compute @workgroup_size(16, 16) fn main() {}
      @compute @workgroup_size(9) fn normalize() {}
      @compute @workgroup_size(1) fn extractDominantLight() {}
    `;
  }

  /**
   * Estimate lighting from camera frame
   */
  async estimate(cameraTexture: GPUTexture, width: number, height: number): Promise<LightEstimate> {
    const now = performance.now();

    // Throttle updates
    if (this.currentEstimate && now - this.lastUpdateTime < this.config.updateInterval) {
      return this.currentEstimate;
    }

    if (!this.shPipeline || !this.normalizePipeline || !this.extractLightPipeline) {
      throw new Error('Light estimator not initialized');
    }

    const device = this.gpuContext.getDevice();

    // Update params
    const params = new Uint32Array(4);
    params[0] = width;
    params[1] = height;
    params[2] = width * height; // sample count
    device.queue.writeBuffer(this.shParamsBuffer!, 0, params);

    // Clear coefficients buffer
    device.queue.writeBuffer(
      this.shCoefficientsBuffer!,
      0,
      new Float32Array(11 * 100 * 4)
    );

    // Execute SH computation
    const encoder = device.createCommandEncoder({ label: 'Light Estimation' });

    // Pass 1: Compute SH coefficients
    const shBindGroup = this.shPipeline.createBindGroup([
      { binding: 0, resource: cameraTexture.createView() },
      { binding: 1, resource: { buffer: this.shCoefficientsBuffer! } },
      { binding: 2, resource: { buffer: this.shParamsBuffer! } },
    ]);

    const shPass = encoder.beginComputePass({ label: 'SH Computation' });
    shPass.setPipeline(this.shPipeline.getPipeline());
    shPass.setBindGroup(0, shBindGroup);
    const workgroupsX = Math.ceil(width / 16);
    const workgroupsY = Math.ceil(height / 16);
    shPass.dispatchWorkgroups(workgroupsX, workgroupsY);
    shPass.end();

    // Pass 2: Normalize coefficients
    const normalizeBindGroup = this.normalizePipeline.createBindGroup([
      { binding: 0, resource: cameraTexture.createView() }, // Not used but required
      { binding: 1, resource: { buffer: this.shCoefficientsBuffer! } },
      { binding: 2, resource: { buffer: this.shParamsBuffer! } },
    ]);

    const normalizePass = encoder.beginComputePass({ label: 'SH Normalize' });
    normalizePass.setPipeline(this.normalizePipeline.getPipeline());
    normalizePass.setBindGroup(0, normalizeBindGroup);
    normalizePass.dispatchWorkgroups(1);
    normalizePass.end();

    // Pass 3: Extract dominant light
    const extractBindGroup = this.extractLightPipeline.createBindGroup([
      { binding: 0, resource: cameraTexture.createView() },
      { binding: 1, resource: { buffer: this.shCoefficientsBuffer! } },
      { binding: 2, resource: { buffer: this.shParamsBuffer! } },
    ]);

    const extractPass = encoder.beginComputePass({ label: 'Extract Light' });
    extractPass.setPipeline(this.extractLightPipeline.getPipeline());
    extractPass.setBindGroup(0, extractBindGroup);
    extractPass.dispatchWorkgroups(1);
    extractPass.end();

    // Copy to current readback buffer
    const readbackBuffer = this.shReadbackBuffers[this.currentReadbackIndex]!;
    encoder.copyBufferToBuffer(
      this.shCoefficientsBuffer!,
      0,
      readbackBuffer,
      0,
      11 * 100 * 16
    );

    device.queue.submit([encoder.finish()]);

    // Read back results
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(readbackBuffer.getMappedRange());

    // Extract SH coefficients (first 9, RGB interleaved)
    const shCoefficients = new Float32Array(27);
    for (let i = 0; i < 9; i++) {
      const offset = i * 4;
      shCoefficients[i * 3 + 0] = data[offset + 0]; // R
      shCoefficients[i * 3 + 1] = data[offset + 1]; // G
      shCoefficients[i * 3 + 2] = data[offset + 2]; // B
    }

    // Extract dominant direction (coefficient 9)
    const dominantDirection = new Vector3(
      data[9 * 4 + 0],
      data[9 * 4 + 1],
      data[9 * 4 + 2]
    );

    // Extract ambient color and intensity (coefficient 10)
    const ambientColor: [number, number, number] = [
      data[10 * 4 + 0],
      data[10 * 4 + 1],
      data[10 * 4 + 2],
    ];
    const intensity = data[10 * 4 + 3];

    readbackBuffer.unmap();

    // Swap buffers for next frame
    this.currentReadbackIndex = 1 - this.currentReadbackIndex;

    // Estimate color temperature
    const colorTemperature = this.estimateColorTemperature(ambientColor);

    // Create estimate
    const estimate: LightEstimate = {
      shCoefficients,
      dominantDirection,
      ambientColor,
      intensity,
      colorTemperature,
      timestamp: now,
    };

    // Apply temporal smoothing
    if (this.currentEstimate) {
      estimate.shCoefficients = this.smoothCoefficients(
        this.currentEstimate.shCoefficients,
        estimate.shCoefficients
      );
      estimate.intensity =
        this.currentEstimate.intensity * (1 - this.config.smoothingFactor) +
        estimate.intensity * this.config.smoothingFactor;
    }

    this.currentEstimate = estimate;
    this.lastUpdateTime = now;

    return estimate;
  }

  /**
   * Smooth coefficients over time
   */
  private smoothCoefficients(prev: Float32Array, current: Float32Array): Float32Array {
    const smoothed = new Float32Array(27);
    const alpha = this.config.smoothingFactor;

    for (let i = 0; i < 27; i++) {
      smoothed[i] = prev[i] * (1 - alpha) + current[i] * alpha;
    }

    return smoothed;
  }

  /**
   * Estimate color temperature from RGB
   */
  private estimateColorTemperature(rgb: [number, number, number]): number {
    const [r, g, b] = rgb;

    // Approximate color temperature using RGB ratios
    // Warm light: more red, Cool light: more blue
    const ratio = (r - b) / (r + g + b + 0.001);

    // Map to temperature range (2000K - 10000K)
    // Warm (2000K): ratio ~0.3
    // Neutral (5500K): ratio ~0
    // Cool (10000K): ratio ~-0.3

    const temp = 5500 - ratio * 10000;
    return Math.max(2000, Math.min(10000, temp));
  }

  /**
   * Get current light estimate
   */
  getCurrentEstimate(): LightEstimate | null {
    return this.currentEstimate;
  }

  /**
   * Reset estimator state
   */
  reset(): void {
    this.currentEstimate = null;
    this.lastUpdateTime = 0;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.shCoefficientsBuffer?.destroy();
    this.shParamsBuffer?.destroy();
    this.shReadbackBuffers[0]?.destroy();
    this.shReadbackBuffers[1]?.destroy();
    this.currentEstimate = null;
    this.pendingReadback = null;
  }
}
