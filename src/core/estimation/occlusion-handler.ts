/**
 * Occlusion Handler
 * Generates occlusion buffer for realistic AR object placement
 */

import type { GPUContextManager } from '../gpu/gpu-context';
import { ComputePipeline } from '../gpu/compute-pipeline';

export interface OcclusionConfig {
  resolution?: { width: number; height: number };
  depthThreshold?: number; // Minimum depth difference for occlusion (meters)
  blurRadius?: number; // Edge softening
}

export class OcclusionHandler {
  private gpuContext: GPUContextManager;
  private config: Required<OcclusionConfig>;

  // Textures
  private occlusionTexture: GPUTexture | null = null;
  private blurredOcclusionTexture: GPUTexture | null = null;

  // Pipelines
  private occlusionPipeline: ComputePipeline | null = null;
  private blurPipeline: ComputePipeline | null = null;

  // Buffers
  private paramsBuffer: GPUBuffer | null = null;

  constructor(gpuContext: GPUContextManager, config: OcclusionConfig = {}) {
    this.gpuContext = gpuContext;
    this.config = {
      resolution: config.resolution ?? { width: 640, height: 480 },
      depthThreshold: config.depthThreshold ?? 0.01, // 1cm
      blurRadius: config.blurRadius ?? 2,
    };
  }

  /**
   * Initialize occlusion handler
   */
  async initialize(width: number, height: number): Promise<void> {
    const device = this.gpuContext.getDevice();

    this.config.resolution = { width, height };

    // Load shaders
    const occlusionShader = this.getOcclusionShader();
    const blurShader = this.getBlurShader();

    // Create pipelines
    this.occlusionPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Occlusion Generation',
      shaderCode: occlusionShader,
    });

    this.blurPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Occlusion Blur',
      shaderCode: blurShader,
    });

    // Create textures
    this.occlusionTexture = device.createTexture({
      label: 'Occlusion Buffer',
      size: { width, height },
      format: 'r32float',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    this.blurredOcclusionTexture = device.createTexture({
      label: 'Blurred Occlusion',
      size: { width, height },
      format: 'r32float',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    // Create params buffer
    this.paramsBuffer = device.createBuffer({
      label: 'Occlusion Params',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.updateParams(width, height);

    console.log('[OcclusionHandler] Initialized');
  }

  /**
   * Update parameters
   */
  private updateParams(width: number, height: number): void {
    const data = new Float32Array(8);
    data[0] = width;
    data[1] = height;
    data[2] = this.config.depthThreshold;
    data[3] = this.config.blurRadius;

    this.gpuContext.writeBuffer(this.paramsBuffer!, 0, data.buffer);
  }

  /**
   * Generate occlusion buffer from depth
   */
  async generateOcclusion(depthTexture: GPUTexture): Promise<GPUTexture> {
    if (!this.occlusionPipeline || !this.blurPipeline) {
      throw new Error('Occlusion handler not initialized');
    }

    const device = this.gpuContext.getDevice();
    const encoder = device.createCommandEncoder({ label: 'Occlusion Generation' });

    // Pass 1: Generate occlusion from depth
    const occlusionBindGroup = this.occlusionPipeline.createBindGroup([
      { binding: 0, resource: depthTexture.createView() },
      { binding: 1, resource: this.occlusionTexture!.createView() },
      { binding: 2, resource: { buffer: this.paramsBuffer! } },
    ]);

    const occlusionPass = encoder.beginComputePass({ label: 'Occlusion' });
    occlusionPass.setPipeline(this.occlusionPipeline.getPipeline());
    occlusionPass.setBindGroup(0, occlusionBindGroup);

    const workgroupsX = Math.ceil(this.config.resolution.width / 16);
    const workgroupsY = Math.ceil(this.config.resolution.height / 16);
    occlusionPass.dispatchWorkgroups(workgroupsX, workgroupsY);
    occlusionPass.end();

    // Pass 2: Blur for soft edges
    const blurBindGroup = this.blurPipeline.createBindGroup([
      { binding: 0, resource: this.occlusionTexture!.createView() },
      { binding: 1, resource: this.blurredOcclusionTexture!.createView() },
      { binding: 2, resource: { buffer: this.paramsBuffer! } },
    ]);

    const blurPass = encoder.beginComputePass({ label: 'Blur' });
    blurPass.setPipeline(this.blurPipeline.getPipeline());
    blurPass.setBindGroup(0, blurBindGroup);
    blurPass.dispatchWorkgroups(workgroupsX, workgroupsY);
    blurPass.end();

    device.queue.submit([encoder.finish()]);

    return this.blurredOcclusionTexture!;
  }

  /**
   * Get occlusion shader
   */
  private getOcclusionShader(): string {
    return `
      @group(0) @binding(0) var depthInput: texture_2d<f32>;
      @group(0) @binding(1) var occlusionOutput: texture_storage_2d<r32float, write>;
      @group(0) @binding(2) var<uniform> params: Params;

      struct Params {
        width: f32,
        height: f32,
        depthThreshold: f32,
        blurRadius: f32,
      }

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let coord = vec2<i32>(global_id.xy);
        let width = i32(params.width);
        let height = i32(params.height);

        if (coord.x >= width || coord.y >= height) {
          return;
        }

        // Read depth
        let depth = textureLoad(depthInput, coord, 0).r;

        // Convert to occlusion value
        // Near objects (low depth) = high occlusion (1.0)
        // Far objects (high depth) = low occlusion (0.0)
        var occlusion: f32;

        if (depth <= 0.0 || depth > 10.0) {
          occlusion = 0.0; // Invalid depth = no occlusion
        } else {
          // Map depth to occlusion [0, 1]
          // Near (0.1m) -> 1.0
          // Far (10m) -> 0.0
          occlusion = 1.0 - clamp((depth - 0.1) / 9.9, 0.0, 1.0);
        }

        textureStore(occlusionOutput, coord, vec4<f32>(occlusion));
      }
    `;
  }

  /**
   * Get blur shader
   */
  private getBlurShader(): string {
    return `
      @group(0) @binding(0) var occlusionInput: texture_2d<f32>;
      @group(0) @binding(1) var occlusionOutput: texture_storage_2d<r32float, write>;
      @group(0) @binding(2) var<uniform> params: Params;

      struct Params {
        width: f32,
        height: f32,
        depthThreshold: f32,
        blurRadius: f32,
      }

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let coord = vec2<i32>(global_id.xy);
        let width = i32(params.width);
        let height = i32(params.height);

        if (coord.x >= width || coord.y >= height) {
          return;
        }

        // Gaussian blur
        let radius = i32(params.blurRadius);
        var sum = 0.0;
        var weightSum = 0.0;

        for (var dy = -radius; dy <= radius; dy++) {
          for (var dx = -radius; dx <= radius; dx++) {
            let sampleCoord = coord + vec2<i32>(dx, dy);

            // Bounds check
            if (sampleCoord.x < 0 || sampleCoord.x >= width ||
                sampleCoord.y < 0 || sampleCoord.y >= height) {
              continue;
            }

            let value = textureLoad(occlusionInput, sampleCoord, 0).r;

            // Gaussian weight
            let dist = f32(dx * dx + dy * dy);
            let sigma = params.blurRadius;
            let weight = exp(-dist / (2.0 * sigma * sigma));

            sum += value * weight;
            weightSum += weight;
          }
        }

        let blurred = sum / weightSum;
        textureStore(occlusionOutput, coord, vec4<f32>(blurred));
      }
    `;
  }

  /**
   * Get occlusion texture
   */
  getOcclusionTexture(): GPUTexture | null {
    return this.blurredOcclusionTexture;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OcclusionConfig>): void {
    if (config.depthThreshold !== undefined) {
      this.config.depthThreshold = config.depthThreshold;
    }
    if (config.blurRadius !== undefined) {
      this.config.blurRadius = config.blurRadius;
    }

    if (this.paramsBuffer) {
      this.updateParams(this.config.resolution.width, this.config.resolution.height);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.occlusionTexture?.destroy();
    this.blurredOcclusionTexture?.destroy();
    this.paramsBuffer?.destroy();
  }
}
