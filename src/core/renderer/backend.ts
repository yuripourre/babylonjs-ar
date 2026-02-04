/**
 * Render Backend Abstraction
 * Unified interface for WebGPU and WebGL2 backends
 * Enables framework to work with either GPU API transparently
 */

export type BackendType = 'webgpu' | 'webgl2';

export interface TextureDescriptor {
  label?: string;
  width: number;
  height: number;
  format: TextureFormat;
  usage: TextureUsage;
  mipLevelCount?: number;
}

export interface BufferDescriptor {
  label?: string;
  size: number;
  usage: BufferUsage;
}

export interface ShaderDescriptor {
  label?: string;
  code: string;
  entryPoint?: string;
  type: 'compute' | 'vertex' | 'fragment';
}

export interface PipelineDescriptor {
  label?: string;
  compute?: {
    shader: RenderShader;
    entryPoint?: string;
  };
  vertex?: {
    shader: RenderShader;
    entryPoint?: string;
  };
  fragment?: {
    shader: RenderShader;
    entryPoint?: string;
  };
  layout?: 'auto' | RenderBindGroupLayout[];
}

// Texture formats (subset compatible with both APIs)
export type TextureFormat =
  | 'r8unorm'
  | 'r32float'
  | 'rg32float'
  | 'rgba8unorm'
  | 'rgba16float'
  | 'rgba32float'
  | 'depth24plus';

// Texture usage flags (use const enum for proper value access)
export const enum TextureUsage {
  COPY_SRC = 0x01,
  COPY_DST = 0x02,
  TEXTURE = 0x04,
  STORAGE = 0x08,
  RENDER_ATTACHMENT = 0x10,
}

// Buffer usage flags (use const enum for proper value access)
export const enum BufferUsage {
  COPY_SRC = 0x01,
  COPY_DST = 0x02,
  STORAGE = 0x04,
  UNIFORM = 0x08,
  VERTEX = 0x10,
  INDEX = 0x20,
  INDIRECT = 0x40,
}

/**
 * Abstract texture interface
 */
export interface RenderTexture {
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  destroy(): void;

  // WebGPU-specific (for compatibility)
  createView?(): any;
}

/**
 * Abstract buffer interface
 */
export interface RenderBuffer {
  readonly size: number;
  readonly usage: number;
  destroy(): void;

  // Async mapping for readback
  mapAsync?(mode: number): Promise<void>;
  getMappedRange?(offset?: number, size?: number): ArrayBuffer;
  unmap?(): void;
}

/**
 * Abstract shader interface
 */
export interface RenderShader {
  readonly type: 'compute' | 'vertex' | 'fragment';
  destroy(): void;
}

/**
 * Abstract pipeline interface
 */
export interface RenderPipeline {
  destroy(): void;
  getBindGroupLayout?(index: number): RenderBindGroupLayout;
}

/**
 * Abstract bind group layout
 */
export interface RenderBindGroupLayout {
  // Marker interface
}

/**
 * Abstract bind group
 */
export interface RenderBindGroup {
  // Marker interface
}

/**
 * Bind group entry
 */
export interface BindGroupEntry {
  binding: number;
  resource:
    | { buffer: RenderBuffer; offset?: number; size?: number }
    | RenderTexture
    | any; // For samplers, external textures, etc.
}

/**
 * Command encoder for recording GPU commands
 */
export interface RenderCommandEncoder {
  beginComputePass(label?: string): RenderComputePass;
  beginRenderPass?(descriptor: any): RenderRenderPass;

  copyBufferToBuffer(
    source: RenderBuffer,
    sourceOffset: number,
    destination: RenderBuffer,
    destinationOffset: number,
    size: number
  ): void;

  copyTextureToBuffer(
    source: { texture: RenderTexture },
    destination: { buffer: RenderBuffer; bytesPerRow: number },
    size: { width: number; height: number }
  ): void;

  finish(): RenderCommandBuffer;
}

/**
 * Compute pass for compute shaders
 */
export interface RenderComputePass {
  setPipeline(pipeline: RenderPipeline): void;
  setBindGroup(index: number, bindGroup: RenderBindGroup): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}

/**
 * Render pass for graphics rendering
 */
export interface RenderRenderPass {
  end(): void;
}

/**
 * Command buffer
 */
export interface RenderCommandBuffer {
  // Marker interface
}

/**
 * Main render backend interface
 * Both WebGPU and WebGL2 implement this
 */
export interface RenderBackend {
  readonly type: BackendType;

  // Initialization
  initialize(config?: any): Promise<void>;
  destroy(): void;

  // Resource creation
  createTexture(descriptor: TextureDescriptor): RenderTexture;
  createBuffer(descriptor: BufferDescriptor): RenderBuffer;
  createShader(descriptor: ShaderDescriptor): RenderShader;
  createPipeline(descriptor: PipelineDescriptor): RenderPipeline;

  createBindGroupLayout(entries: any[]): RenderBindGroupLayout;
  createBindGroup(layout: RenderBindGroupLayout, entries: BindGroupEntry[]): RenderBindGroup;

  // Command recording
  createCommandEncoder(label?: string): RenderCommandEncoder;
  submit(commandBuffers: RenderCommandBuffer[]): void;

  // Data transfer
  writeBuffer(buffer: RenderBuffer, offset: number, data: BufferSource): void;
  writeTexture(
    destination: { texture: RenderTexture },
    data: BufferSource,
    layout: { bytesPerRow: number },
    size: { width: number; height: number }
  ): void;

  // External texture import (for camera feed)
  importExternalTexture?(source: any): any;

  // Canvas integration
  getCanvasContext?(canvas: HTMLCanvasElement): any;

  // Feature detection
  supportsFeature(feature: string): boolean;

  // Capabilities
  getInfo(): {
    type: BackendType;
    vendor?: string;
    renderer?: string;
    features: string[];
  };
}

/**
 * Backend configuration
 */
export interface BackendConfig {
  preferredBackend?: BackendType;
  powerPreference?: 'low-power' | 'high-performance';
  fallbackToWebGL?: boolean; // Auto-fallback if WebGPU unavailable
}

/**
 * Factory for creating render backends
 */
export class RenderBackendFactory {
  /**
   * Create a render backend with auto-detection
   */
  static async create(config: BackendConfig = {}): Promise<RenderBackend> {
    const preferWebGPU = config.preferredBackend !== 'webgl2';
    const fallback = config.fallbackToWebGL ?? true;

    // Try WebGPU first if preferred
    if (preferWebGPU && this.isWebGPUAvailable()) {
      try {
        const { WebGPUBackend } = await import('./webgpu-backend');
        const backend = new WebGPUBackend();
        await backend.initialize(config);
        console.log('[RenderBackend] Using WebGPU');
        return backend;
      } catch (error) {
        console.warn('[RenderBackend] WebGPU initialization failed:', error);
        if (!fallback) throw error;
      }
    }

    // Fall back to WebGL2
    if (this.isWebGL2Available()) {
      const { WebGL2Backend } = await import('./webgl-backend');
      const backend = new WebGL2Backend();
      await backend.initialize(config);
      console.log('[RenderBackend] Using WebGL2 (fallback)');
      return backend;
    }

    throw new Error(
      'No compatible GPU backend available. Requires WebGPU (Chrome 113+, Edge 113+, Safari 18+) or WebGL2.'
    );
  }

  /**
   * Check if WebGPU is available
   */
  static isWebGPUAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu !== undefined;
  }

  /**
   * Check if WebGL2 is available
   */
  static isWebGL2Available(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      return gl !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get recommended backend for current environment
   */
  static getRecommendedBackend(): BackendType {
    if (this.isWebGPUAvailable()) return 'webgpu';
    if (this.isWebGL2Available()) return 'webgl2';
    throw new Error('No GPU backend available');
  }
}
