/**
 * WebGPU Context Manager
 * Handles GPU device initialization, adapter selection, and resource management
 */

export interface GPUContextConfig {
  powerPreference?: 'low-power' | 'high-performance';
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Record<string, number>;
}

export class GPUContextManager {
  private device: GPUDevice | null = null;
  private adapter: GPUAdapter | null = null;
  private isInitialized = false;

  /**
   * Initialize WebGPU context
   */
  async initialize(config: GPUContextConfig = {}): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }

    // Request adapter
    this.adapter = await navigator.gpu.requestAdapter({
      powerPreference: config.powerPreference ?? 'high-performance',
    });

    if (!this.adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    // Log adapter info (if available)
    if ('requestAdapterInfo' in this.adapter) {
      const info = await (this.adapter as any).requestAdapterInfo();
      console.log('[WebGPU] Adapter:', info.vendor, info.architecture);
    }

    // Request device with features and limits
    const requiredFeatures: GPUFeatureName[] = config.requiredFeatures ?? [];

    // Add texture compression features if available
    const supportedFeatures = this.adapter.features;
    if (supportedFeatures.has('texture-compression-bc')) {
      requiredFeatures.push('texture-compression-bc');
    }

    this.device = await this.adapter.requestDevice({
      requiredFeatures,
      requiredLimits: config.requiredLimits,
    });

    if (!this.device) {
      throw new Error('Failed to get WebGPU device');
    }

    // Handle device lost
    this.device.lost.then((info) => {
      console.error('[WebGPU] Device lost:', info.message);
      this.isInitialized = false;
    });

    // Handle uncaptured errors
    this.device.addEventListener('uncapturederror', (event) => {
      console.error('[WebGPU] Uncaptured error:', event.error);
    });

    this.isInitialized = true;
    console.log('[WebGPU] Initialized successfully');
  }

  /**
   * Get the GPU device
   */
  getDevice(): GPUDevice {
    if (!this.device) {
      throw new Error('WebGPU device not initialized. Call initialize() first.');
    }
    return this.device;
  }

  /**
   * Get the GPU adapter
   */
  getAdapter(): GPUAdapter {
    if (!this.adapter) {
      throw new Error('WebGPU adapter not initialized. Call initialize() first.');
    }
    return this.adapter;
  }

  /**
   * Check if context is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.device !== null;
  }

  /**
   * Create a buffer with initial data
   */
  createBuffer(
    size: number,
    usage: GPUBufferUsageFlags,
    data?: BufferSource
  ): GPUBuffer {
    const device = this.getDevice();

    const buffer = device.createBuffer({
      size,
      usage,
      mappedAtCreation: !!data,
    });

    if (data) {
      const arrayBuffer = buffer.getMappedRange();
      if (data instanceof ArrayBuffer) {
        new Uint8Array(arrayBuffer).set(new Uint8Array(data));
      } else {
        new Uint8Array(arrayBuffer).set(new Uint8Array(data.buffer));
      }
      buffer.unmap();
    }

    return buffer;
  }

  /**
   * Create a texture
   */
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture {
    const device = this.getDevice();
    return device.createTexture(descriptor);
  }

  /**
   * Create a sampler
   */
  createSampler(descriptor: GPUSamplerDescriptor = {}): GPUSampler {
    const device = this.getDevice();
    return device.createSampler(descriptor);
  }

  /**
   * Submit command buffers to the queue
   */
  submit(commandBuffers: GPUCommandBuffer[]): void {
    const device = this.getDevice();
    device.queue.submit(commandBuffers);
  }

  /**
   * Write data to a buffer
   */
  writeBuffer(
    buffer: GPUBuffer,
    bufferOffset: number,
    data: BufferSource,
    dataOffset?: number,
    size?: number
  ): void {
    const device = this.getDevice();
    device.queue.writeBuffer(buffer, bufferOffset, data, dataOffset, size);
  }

  /**
   * Write data to a texture
   */
  writeTexture(
    destination: GPUImageCopyTexture,
    data: BufferSource,
    dataLayout: GPUImageDataLayout,
    size: GPUExtent3D
  ): void {
    const device = this.getDevice();
    device.queue.writeTexture(destination, data, dataLayout, size);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.adapter = null;
    this.isInitialized = false;
  }
}
