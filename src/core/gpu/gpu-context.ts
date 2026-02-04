/**
 * GPU Context Manager
 * Unified GPU abstraction supporting WebGPU and WebGL2
 * Automatically falls back to WebGL2 if WebGPU is unavailable
 */

import { RenderBackendFactory, type RenderBackend, type BackendType } from '../renderer/backend';

export interface GPUContextConfig {
  powerPreference?: 'low-power' | 'high-performance';
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Record<string, number>;
  preferredBackend?: BackendType;
  fallbackToWebGL?: boolean;
}

export class GPUContextManager {
  private backend: RenderBackend | null = null;
  private device: GPUDevice | null = null;
  private adapter: GPUAdapter | null = null;
  private isInitialized = false;

  /**
   * Initialize GPU context (WebGPU or WebGL2 fallback)
   */
  async initialize(config: GPUContextConfig = {}): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Create render backend (auto-detects WebGPU/WebGL2)
    try {
      this.backend = await RenderBackendFactory.create({
        preferredBackend: config.preferredBackend,
        powerPreference: config.powerPreference,
        fallbackToWebGL: config.fallbackToWebGL ?? true,
      });

      console.log(`[GPUContext] Using ${this.backend.type.toUpperCase()} backend`);
    } catch (error) {
      console.error('[GPUContext] Failed to create render backend:', error);
      throw error;
    }

    // For WebGPU backend, also store native device/adapter for backward compatibility
    if (this.backend.type === 'webgpu') {
      // Try to get WebGPU device directly for backward compatibility
      if (navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: config.powerPreference ?? 'high-performance',
        });

        if (adapter) {
          this.adapter = adapter as unknown as GPUAdapter;
          const device = await adapter.requestDevice({
            requiredFeatures: config.requiredFeatures,
            requiredLimits: config.requiredLimits,
          });

          this.device = device as unknown as GPUDevice;

          // Handle device lost
          this.device?.lost.then((info) => {
            console.error('[WebGPU] Device lost:', info.message);
            this.isInitialized = false;
          });

          // Handle uncaptured errors
          this.device?.addEventListener('uncapturederror', (event) => {
            console.error('[WebGPU] Uncaptured error:', event.error);
          });
        }
      }
    }

    this.isInitialized = true;
  }

  /**
   * Get the render backend
   */
  getBackend(): RenderBackend {
    if (!this.backend) {
      throw new Error('GPU context not initialized. Call initialize() first.');
    }
    return this.backend;
  }

  /**
   * Get backend type
   */
  getBackendType(): BackendType {
    return this.backend?.type ?? 'webgpu';
  }

  /**
   * Get the GPU device (WebGPU only, for backward compatibility)
   */
  getDevice(): GPUDevice {
    if (!this.device) {
      throw new Error('WebGPU device not available. Using WebGL2 backend or not initialized.');
    }
    return this.device;
  }

  /**
   * Get the GPU adapter (WebGPU only, for backward compatibility)
   */
  getAdapter(): GPUAdapter {
    if (!this.adapter) {
      throw new Error('WebGPU adapter not available. Using WebGL2 backend or not initialized.');
    }
    return this.adapter;
  }

  /**
   * Check if context is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.backend !== null;
  }

  /**
   * Create a buffer with initial data
   * (Backward compatibility wrapper)
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
   * (Backward compatibility wrapper)
   */
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture {
    const device = this.getDevice();
    return device.createTexture(descriptor);
  }

  /**
   * Create a sampler
   * (Backward compatibility wrapper)
   */
  createSampler(descriptor: GPUSamplerDescriptor = {}): GPUSampler {
    const device = this.getDevice();
    return device.createSampler(descriptor);
  }

  /**
   * Submit command buffers to the queue
   * (Backward compatibility wrapper)
   */
  submit(commandBuffers: GPUCommandBuffer[]): void {
    const device = this.getDevice();
    device.queue.submit(commandBuffers);
  }

  /**
   * Write data to a buffer
   * (Backward compatibility wrapper)
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
   * (Backward compatibility wrapper)
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
    if (this.backend) {
      this.backend.destroy();
      this.backend = null;
    }
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.adapter = null;
    this.isInitialized = false;
  }
}
