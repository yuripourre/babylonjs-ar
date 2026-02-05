/**
 * Compute Pipeline Builder
 * Simplifies creation and execution of WebGPU compute pipelines
 */

import type { GPUContextManager } from './gpu-context';

export interface ComputePipelineConfig {
  label?: string;
  shaderCode: string;
  entryPoint?: string;
  constants?: Record<string, GPUPipelineConstantValue>;
}

export interface BindGroupEntry {
  binding: number;
  resource: GPUBindingResource;
}

export class ComputePipeline {
  private pipeline: GPUComputePipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private device: GPUDevice;

  constructor(
    private gpuContext: GPUContextManager,
    config: ComputePipelineConfig
  ) {
    this.device = gpuContext.device;

    // Create shader module
    const shaderModule = this.device.createShaderModule({
      label: config.label ? `${config.label}-shader` : undefined,
      code: config.shaderCode,
    });

    // Create pipeline
    this.pipeline = this.device.createComputePipeline({
      label: config.label,
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: config.entryPoint ?? 'main',
        constants: config.constants,
      },
    });

    // Get bind group layout
    this.bindGroupLayout = this.pipeline.getBindGroupLayout(0) as GPUBindGroupLayout;
  }

  /**
   * Create a bind group for this pipeline
   */
  createBindGroup(entries: BindGroupEntry[], label?: string): GPUBindGroup {
    return this.device.createBindGroup({
      label,
      layout: this.bindGroupLayout,
      entries: entries.map((entry) => ({
        binding: entry.binding,
        resource: entry.resource,
      })),
    });
  }

  /**
   * Execute the compute pipeline
   */
  execute(
    bindGroup: GPUBindGroup,
    workgroupCount: { x: number; y: number; z?: number }
  ): GPUCommandBuffer {
    const commandEncoder = this.device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();

    computePass.setPipeline(this.pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      workgroupCount.x,
      workgroupCount.y,
      workgroupCount.z ?? 1
    );
    computePass.end();

    return commandEncoder.finish();
  }

  /**
   * Execute with automatic submission
   */
  executeAndSubmit(
    bindGroup: GPUBindGroup,
    workgroupCount: { x: number; y: number; z?: number }
  ): void {
    const commandBuffer = this.execute(bindGroup, workgroupCount);
    this.device.queue.submit([commandBuffer]);
  }

  /**
   * Get the underlying GPU pipeline
   */
  getPipeline(): GPUComputePipeline {
    return this.pipeline;
  }

  /**
   * Get the bind group layout
   */
  getBindGroupLayout(): GPUBindGroupLayout {
    return this.bindGroupLayout;
  }
}

/**
 * Helper to calculate workgroup counts for 2D textures
 */
export function calculateWorkgroupCount(
  width: number,
  height: number,
  workgroupSize: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: Math.ceil(width / workgroupSize.x),
    y: Math.ceil(height / workgroupSize.y),
  };
}

/**
 * Helper to align buffer size to 256 bytes (WebGPU requirement)
 */
export function alignBufferSize(size: number): number {
  return Math.ceil(size / 256) * 256;
}
