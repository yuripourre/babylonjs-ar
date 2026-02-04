/**
 * Indirect Dispatch Helper
 * GPU-driven workgroup count computation for reduced CPU-GPU sync
 * Phase 4 optimization
 */

import type { GPUContextManager } from './gpu-context';

export interface IndirectDispatchConfig {
  maxWorkgroups?: { x: number; y: number; z: number };
  workgroupSize?: { x: number; y: number; z: number };
}

/**
 * Manages indirect dispatch buffers for GPU-driven workloads
 *
 * Instead of:
 *   pass.dispatchWorkgroups(Math.ceil(width/16), Math.ceil(height/16));
 *
 * Use:
 *   pass.dispatchWorkgroupsIndirect(indirectBuffer, 0);
 *
 * Where the GPU computes the workgroup count based on dynamic conditions
 */
export class IndirectDispatch {
  private gpuContext: GPUContextManager;
  private config: Required<IndirectDispatchConfig>;

  // Indirect buffers (4 x u32: x, y, z, padding)
  private indirectBuffer: GPUBuffer | null = null;
  private computeDispatchPipeline: GPUComputePipeline | null = null;

  constructor(
    gpuContext: GPUContextManager,
    config: IndirectDispatchConfig = {}
  ) {
    this.gpuContext = gpuContext;
    this.config = {
      maxWorkgroups: config.maxWorkgroups ?? { x: 256, y: 256, z: 1 },
      workgroupSize: config.workgroupSize ?? { x: 16, y: 16, z: 1 },
    };
  }

  /**
   * Initialize indirect dispatch buffer
   */
  initialize(): void {
    const device = this.gpuContext.getDevice();

    // Create indirect buffer (4 x u32)
    this.indirectBuffer = device.createBuffer({
      label: 'Indirect Dispatch Buffer',
      size: 16, // 4 x u32
      usage:
        GPUBufferUsage.INDIRECT |
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST,
    });

    // Initialize with default values (1, 1, 1, 0)
    const initialData = new Uint32Array([1, 1, 1, 0]);
    device.queue.writeBuffer(this.indirectBuffer, 0, initialData);
  }

  /**
   * Create shader for computing workgroup counts
   * Useful for dynamic workloads (e.g., compact sparse data)
   */
  createComputeDispatchShader(
    inputSize: 'texture' | 'buffer',
    condition?: string
  ): string {
    // Generate WGSL shader that computes workgroup counts
    return `
      @group(0) @binding(0) var<storage, read_write> indirectArgs: array<u32>;
      @group(0) @binding(1) var<storage, read> inputData: array<u32>;
      @group(0) @binding(2) var<uniform> params: ComputeParams;

      struct ComputeParams {
        inputSize: u32,
        workgroupSize: u32,
        _padding: vec2<u32>,
      }

      @compute @workgroup_size(1)
      fn computeDispatchSize() {
        // Count active elements (or use input size)
        var activeCount = 0u;

        ${
          condition
            ? `
        for (var i = 0u; i < params.inputSize; i++) {
          if (${condition}) {
            activeCount++;
          }
        }
        `
            : 'activeCount = params.inputSize;'
        }

        // Compute workgroup counts
        let workgroupCount = (activeCount + params.workgroupSize - 1u) / params.workgroupSize;

        // Write to indirect buffer
        indirectArgs[0] = min(workgroupCount, ${this.config.maxWorkgroups.x}u);
        indirectArgs[1] = 1u;
        indirectArgs[2] = 1u;
        indirectArgs[3] = 0u; // Padding
      }
    `;
  }

  /**
   * Create pipeline for computing dispatch counts
   */
  async createComputePipeline(shaderCode: string): Promise<void> {
    const device = this.gpuContext.getDevice();

    const shaderModule = device.createShaderModule({
      label: 'Compute Dispatch Size',
      code: shaderCode,
    });

    this.computeDispatchPipeline = device.createComputePipeline({
      label: 'Compute Dispatch Pipeline',
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'computeDispatchSize',
      },
    });
  }

  /**
   * Compute workgroup counts on GPU
   */
  computeDispatchSize(
    encoder: GPUCommandEncoder,
    inputBuffer: GPUBuffer,
    inputSize: number,
    workgroupSize: number
  ): void {
    if (!this.computeDispatchPipeline || !this.indirectBuffer) {
      throw new Error('Indirect dispatch not initialized');
    }

    const device = this.gpuContext.getDevice();

    // Create params buffer
    const paramsBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const params = new Uint32Array([inputSize, workgroupSize, 0, 0]);
    device.queue.writeBuffer(paramsBuffer, 0, params);

    // Create bind group
    const bindGroupLayout = this.computeDispatchPipeline.getBindGroupLayout(0) as GPUBindGroupLayout;
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.indirectBuffer } },
        { binding: 1, resource: { buffer: inputBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ],
    });

    // Dispatch computation
    const pass = encoder.beginComputePass({
      label: 'Compute Dispatch Size',
    });
    pass.setPipeline(this.computeDispatchPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(1); // Single thread computes counts
    pass.end();

    paramsBuffer.destroy();
  }

  /**
   * Get indirect buffer for use in dispatchWorkgroupsIndirect
   */
  getIndirectBuffer(): GPUBuffer {
    if (!this.indirectBuffer) {
      throw new Error('Indirect dispatch not initialized');
    }
    return this.indirectBuffer;
  }

  /**
   * Update indirect buffer directly (CPU-side)
   * Use this when workgroup count is known on CPU
   */
  updateDispatchSize(x: number, y: number = 1, z: number = 1): void {
    if (!this.indirectBuffer) {
      throw new Error('Indirect dispatch not initialized');
    }

    const device = this.gpuContext.getDevice();
    const data = new Uint32Array([
      Math.min(x, this.config.maxWorkgroups.x),
      Math.min(y, this.config.maxWorkgroups.y),
      Math.min(z, this.config.maxWorkgroups.z),
      0,
    ]);

    device.queue.writeBuffer(this.indirectBuffer, 0, data);
  }

  /**
   * Example: Compact sparse data and dispatch based on count
   */
  static createCompactionShader(): string {
    return `
      // Compact sparse data (e.g., detected features) into dense array
      @group(0) @binding(0) var<storage, read> sparseData: array<u32>;
      @group(0) @binding(1) var<storage, read_write> compactData: array<u32>;
      @group(0) @binding(2) var<storage, read_write> compactCount: atomic<u32>;
      @group(0) @binding(3) var<uniform> params: CompactParams;

      struct CompactParams {
        sparseSize: u32,
        _padding: vec3<u32>,
      }

      @compute @workgroup_size(256)
      fn compact(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let idx = global_id.x;

        if (idx >= params.sparseSize) {
          return;
        }

        let value = sparseData[idx];

        // Check if active (non-zero)
        if (value != 0u) {
          // Atomically allocate space in compact array
          let compactIdx = atomicAdd(&compactCount, 1u);
          compactData[compactIdx] = value;
        }
      }

      // Compute indirect dispatch from compact count
      @compute @workgroup_size(1)
      fn computeIndirectDispatch(
        @builtin(global_invocation_id) global_id: vec3<u32>
      ) {
        @group(0) @binding(0) var<storage, read> compactCount: array<u32>;
        @group(0) @binding(1) var<storage, read_write> indirectArgs: array<u32>;
        @group(0) @binding(2) var<uniform> params: DispatchParams;

        struct DispatchParams {
          workgroupSize: u32,
          _padding: vec3<u32>,
        }

        let count = compactCount[0];
        let workgroups = (count + params.workgroupSize - 1u) / params.workgroupSize;

        indirectArgs[0] = workgroups;
        indirectArgs[1] = 1u;
        indirectArgs[2] = 1u;
        indirectArgs[3] = 0u;
      }
    `;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.indirectBuffer?.destroy();
    this.indirectBuffer = null;
    this.computeDispatchPipeline = null;
  }
}

/**
 * Example usage:
 *
 * ```typescript
 * const indirectDispatch = new IndirectDispatch(gpuContext);
 * indirectDispatch.initialize();
 *
 * // GPU computes workgroup count based on active markers
 * indirectDispatch.computeDispatchSize(encoder, markerBuffer, maxMarkers, 32);
 *
 * // Use indirect dispatch
 * const pass = encoder.beginComputePass();
 * pass.setPipeline(processPipeline);
 * pass.dispatchWorkgroupsIndirect(indirectDispatch.getIndirectBuffer(), 0);
 * pass.end();
 * ```
 */
