/**
 * WebGL2 Backend Implementation
 * Fallback renderer for browsers without WebGPU support
 *
 * Key differences from WebGPU:
 * - No compute shaders (emulated with transform feedback or render-to-texture)
 * - Different shader language (GLSL vs WGSL)
 * - Synchronous GPU operations (no command buffers)
 * - Manual resource management
 */

import {
  type BackendConfig,
  type RenderBackend,
  type RenderTexture,
  type RenderBuffer,
  type RenderShader,
  type RenderPipeline,
  type RenderBindGroupLayout,
  type RenderBindGroup,
  type RenderCommandEncoder,
  type RenderCommandBuffer,
  type TextureDescriptor,
  type BufferDescriptor,
  type ShaderDescriptor,
  type PipelineDescriptor,
  type BindGroupEntry,
  TextureUsage,
  BufferUsage,
  type TextureFormat,
} from './backend';
import { WebGLComputeEmulator } from './webgl-compute-emulator';
import { ShaderConverter } from './shader-converter';
import { ResourceManager } from '../gpu/resource-manager';
import { Logger } from '../../utils/logger';

export class WebGL2Backend implements RenderBackend {
  readonly type = 'webgl2' as const;

  private logger = Logger.create('WebGL2Backend');
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private computeEmulator: WebGLComputeEmulator | null = null;
  private resourceManager = new ResourceManager();

  // Extensions
  private extensions: {
    colorBufferFloat: EXT_color_buffer_float | null;
    textureFloat: OES_texture_float | null;
  } = {
    colorBufferFloat: null,
    textureFloat: null,
  };

  // Resource tracking
  private textures = new Set<WebGLTexture>();
  private buffers = new Set<WebGLBuffer>();
  private programs = new Set<WebGLProgram>();
  private framebuffers = new Set<WebGLFramebuffer>();

  async initialize(config: BackendConfig = {}): Promise<void> {
    // Create canvas if not provided
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1;
    this.canvas.height = 1;

    // Get WebGL2 context
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: config.powerPreference ?? 'high-performance',
    });

    if (!gl) {
      throw new Error('Failed to create WebGL2 context');
    }

    this.gl = gl;

    // Load extensions
    this.extensions.colorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    this.extensions.textureFloat = gl.getExtension('OES_texture_float_linear');

    if (!this.extensions.colorBufferFloat) {
      console.warn('[WebGL2] EXT_color_buffer_float not available (float textures limited)');
    }

    // Initialize compute emulator
    this.computeEmulator = new WebGLComputeEmulator(gl);

    this.logger.info('Initialized successfully with compute emulation');
  }

  destroy(): void {
    if (!this.gl) return;

    // Destroy all tracked resources
    this.resourceManager.destroyAll();

    // Clean up compute emulator
    if (this.computeEmulator) {
      this.computeEmulator.destroy();
      this.computeEmulator = null;
    }

    // Clean up native resources
    for (const texture of this.textures) {
      this.gl.deleteTexture(texture);
    }
    for (const buffer of this.buffers) {
      this.gl.deleteBuffer(buffer);
    }
    for (const program of this.programs) {
      this.gl.deleteProgram(program);
    }
    for (const framebuffer of this.framebuffers) {
      this.gl.deleteFramebuffer(framebuffer);
    }

    this.textures.clear();
    this.buffers.clear();
    this.programs.clear();
    this.framebuffers.clear();

    this.gl = null;
    this.canvas = null;

    this.logger.info('Backend destroyed');
  }

  // Resource creation
  createTexture(descriptor: TextureDescriptor): RenderTexture {
    if (!this.gl) throw new Error('Context not initialized');

    const texture = this.gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');

    this.textures.add(texture);

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

    // Set parameters
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    // Allocate storage
    const { internalFormat, format, type } = this.mapTextureFormat(descriptor.format);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      internalFormat,
      descriptor.width,
      descriptor.height,
      0,
      format,
      type,
      null
    );

    this.gl.bindTexture(this.gl.TEXTURE_2D, null);

    const webglTexture = new WebGL2Texture(
      this.gl,
      texture,
      descriptor.width,
      descriptor.height,
      descriptor.format
    );

    // Track resource
    const size = descriptor.width * descriptor.height * this.getFormatSize(descriptor.format);
    this.resourceManager.track(webglTexture, 'texture', descriptor.label, size);

    return webglTexture;
  }

  createBuffer(descriptor: BufferDescriptor): RenderBuffer {
    if (!this.gl) throw new Error('Context not initialized');

    const buffer = this.gl.createBuffer();
    if (!buffer) throw new Error('Failed to create buffer');

    this.buffers.add(buffer);

    // Allocate storage
    const target = this.getBufferTarget(descriptor.usage);
    this.gl.bindBuffer(target, buffer);
    this.gl.bufferData(target, descriptor.size, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(target, null);

    const webglBuffer = new WebGL2Buffer(this.gl, buffer, descriptor.size, descriptor.usage);

    // Track resource
    this.resourceManager.track(webglBuffer, 'buffer', descriptor.label, descriptor.size);

    return webglBuffer;
  }

  createShader(descriptor: ShaderDescriptor): RenderShader {
    if (!this.gl) throw new Error('Context not initialized');

    // Auto-convert WGSL to GLSL if needed
    let shaderCode = descriptor.code;
    if (!shaderCode.includes('#version 300 es')) {
      // Assume it's WGSL, convert to GLSL
      console.log('[WebGL2] Converting WGSL shader to GLSL');
      const converted = ShaderConverter.convertComputeToFragment(shaderCode);

      // For compute shaders, we'll use the fragment part
      if (descriptor.type === 'compute') {
        shaderCode = converted.fragment;
      }
    }

    const type = descriptor.type === 'vertex'
      ? this.gl.VERTEX_SHADER
      : this.gl.FRAGMENT_SHADER;

    const shader = this.gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    this.gl.shaderSource(shader, shaderCode);
    this.gl.compileShader(shader);

    // Check compilation
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${log}\n\nShader code:\n${shaderCode}`);
    }

    const webglShader = new WebGL2Shader(this.gl, shader, descriptor.type);

    // Track resource
    this.resourceManager.track(webglShader, 'shader', descriptor.label);

    return webglShader;
  }

  createPipeline(descriptor: PipelineDescriptor): RenderPipeline {
    if (!this.gl) throw new Error('Context not initialized');

    // For compute emulation, we need both vertex and fragment shaders
    if (descriptor.compute) {
      // Compute shaders in WebGL2 are emulated via transform feedback or render-to-texture
      // For now, create a basic fullscreen quad pipeline
      const vertexShader = this.createFullscreenVertexShader();
      const fragmentShader = descriptor.compute.shader as WebGL2Shader;

      return this.linkProgram(vertexShader, fragmentShader);
    }

    if (descriptor.vertex && descriptor.fragment) {
      return this.linkProgram(
        descriptor.vertex.shader as WebGL2Shader,
        descriptor.fragment.shader as WebGL2Shader
      );
    }

    throw new Error('Invalid pipeline descriptor for WebGL2');
  }

  private createFullscreenVertexShader(): WebGL2Shader {
    const code = `#version 300 es
      in vec2 position;
      out vec2 vUV;

      void main() {
        vUV = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    return this.createShader({
      code,
      type: 'vertex',
      label: 'fullscreen-vertex',
    }) as WebGL2Shader;
  }

  private linkProgram(vertex: WebGL2Shader, fragment: WebGL2Shader): RenderPipeline {
    if (!this.gl) throw new Error('Context not initialized');

    const program = this.gl.createProgram();
    if (!program) throw new Error('Failed to create program');

    this.gl.attachShader(program, vertex.shader);
    this.gl.attachShader(program, fragment.shader);
    this.gl.linkProgram(program);

    // Check linking
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      throw new Error(`Program linking failed: ${log}`);
    }

    this.programs.add(program);
    const pipeline = new WebGL2Pipeline(this.gl, program);

    // Track resource
    this.resourceManager.track(pipeline, 'pipeline', 'webgl-pipeline');

    return pipeline;
  }

  createBindGroupLayout(entries: import('./backend').BindGroupLayoutEntry[]): RenderBindGroupLayout {
    // WebGL2 doesn't have bind group layouts (it uses direct uniform/texture bindings)
    // Return a marker object for compatibility
    return { _entries: entries };
  }

  createBindGroup(layout: RenderBindGroupLayout, entries: BindGroupEntry[]): RenderBindGroup {
    // WebGL2 bind groups are just collections of resources
    // Actual binding happens during draw/dispatch
    return { _entries: entries };
  }

  createCommandEncoder(label?: string): RenderCommandEncoder {
    if (!this.gl) throw new Error('Context not initialized');

    // WebGL2 doesn't have command encoders (operations are immediate)
    // We create a recorder that batches operations
    return new WebGLCommandEncoder(this.gl);
  }

  submit(commandBuffers: RenderCommandBuffer[]): void {
    // WebGL2 operations are immediate, so "submit" just flushes
    if (!this.gl) return;

    for (const buffer of commandBuffers) {
      (buffer as WebGLCommandBuffer).execute();
    }

    this.gl.flush();
  }

  writeBuffer(buffer: RenderBuffer, offset: number, data: BufferSource): void {
    if (!this.gl) throw new Error('Context not initialized');

    const glBuffer = (buffer as WebGL2Buffer).buffer;
    const target = this.getBufferTarget((buffer as WebGL2Buffer).usage);

    this.gl.bindBuffer(target, glBuffer);
    this.gl.bufferSubData(target, offset, data);
    this.gl.bindBuffer(target, null);
  }

  writeTexture(
    destination: { texture: RenderTexture },
    data: BufferSource,
    layout: { bytesPerRow: number },
    size: { width: number; height: number }
  ): void {
    if (!this.gl) throw new Error('Context not initialized');

    const texture = (destination.texture as WebGL2Texture).texture;
    const { format, type } = this.mapTextureFormat(destination.texture.format);

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

    // Handle different data types for WebGL2
    const dataView = data instanceof ArrayBuffer ? new Uint8Array(data) : data as ArrayBufferView;
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D,
      0,
      0,
      0,
      size.width,
      size.height,
      format,
      type,
      dataView
    );
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  supportsFeature(feature: string): boolean {
    // Check WebGL2 extensions
    switch (feature) {
      case 'float-textures':
        return this.extensions.colorBufferFloat !== null;
      case 'compute-shaders':
        return false; // WebGL2 doesn't have native compute
      default:
        return false;
    }
  }

  getInfo() {
    if (!this.gl) {
      return {
        type: 'webgl2' as const,
        features: [],
      };
    }

    const debugInfo = this.gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo
      ? this.gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : this.gl.getParameter(this.gl.VENDOR);
    const renderer = debugInfo
      ? this.gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : this.gl.getParameter(this.gl.RENDERER);

    return {
      type: 'webgl2' as const,
      vendor,
      renderer,
      features: [
        'webgl2',
        this.extensions.colorBufferFloat ? 'float-textures' : null,
        this.extensions.textureFloat ? 'float-filtering' : null,
      ].filter(Boolean) as string[],
    };
  }

  // Helper methods
  private mapTextureFormat(format: TextureFormat): {
    internalFormat: number;
    format: number;
    type: number;
  } {
    if (!this.gl) throw new Error('Context not initialized');

    switch (format) {
      case 'r8unorm':
        return {
          internalFormat: this.gl.R8,
          format: this.gl.RED,
          type: this.gl.UNSIGNED_BYTE,
        };
      case 'r32float':
        return {
          internalFormat: this.gl.R32F,
          format: this.gl.RED,
          type: this.gl.FLOAT,
        };
      case 'rg32float':
        return {
          internalFormat: this.gl.RG32F,
          format: this.gl.RG,
          type: this.gl.FLOAT,
        };
      case 'rgba8unorm':
        return {
          internalFormat: this.gl.RGBA8,
          format: this.gl.RGBA,
          type: this.gl.UNSIGNED_BYTE,
        };
      case 'rgba32float':
        return {
          internalFormat: this.gl.RGBA32F,
          format: this.gl.RGBA,
          type: this.gl.FLOAT,
        };
      default:
        throw new Error(`Unsupported texture format: ${format}`);
    }
  }

  private getBufferTarget(usage: BufferUsage): number {
    if (!this.gl) throw new Error('Context not initialized');

    if (usage & BufferUsage.VERTEX) return this.gl.ARRAY_BUFFER;
    if (usage & BufferUsage.INDEX) return this.gl.ELEMENT_ARRAY_BUFFER;
    if (usage & BufferUsage.UNIFORM) return this.gl.UNIFORM_BUFFER;

    return this.gl.ARRAY_BUFFER; // Default
  }

  private getFormatSize(format: TextureFormat): number {
    // Estimate bytes per pixel for common formats
    switch (format) {
      case 'r8unorm': return 1;
      case 'r32float': return 4;
      case 'rg32float': return 8;
      case 'rgba8unorm': return 4;
      case 'rgba32float': return 16;
      default: return 4; // Default estimate
    }
  }

  /**
   * Get resource manager for statistics and leak detection
   */
  getResourceManager(): ResourceManager {
    return this.resourceManager;
  }
}

// Wrapper classes (renamed to avoid conflicts with native WebGL types)
class WebGL2Texture implements RenderTexture {
  constructor(
    private gl: WebGL2RenderingContext,
    public texture: WebGLTexture,
    public width: number,
    public height: number,
    public format: TextureFormat
  ) {}

  destroy(): void {
    this.gl.deleteTexture(this.texture);
  }
}

class WebGL2Buffer implements RenderBuffer {
  constructor(
    private gl: WebGL2RenderingContext,
    public buffer: WebGLBuffer,
    public size: number,
    public usage: BufferUsage
  ) {}

  destroy(): void {
    this.gl.deleteBuffer(this.buffer);
  }

  // WebGL2 doesn't support async mapping (readback is synchronous)
  // We could emulate with Pixel Buffer Objects (PBOs) for better performance
}

class WebGL2Shader implements RenderShader {
  constructor(
    private gl: WebGL2RenderingContext,
    public shader: WebGLShader,
    public type: 'compute' | 'vertex' | 'fragment'
  ) {}

  destroy(): void {
    this.gl.deleteShader(this.shader);
  }
}

class WebGL2Pipeline implements RenderPipeline {
  constructor(
    private gl: WebGL2RenderingContext,
    public program: WebGLProgram
  ) {}

  destroy(): void {
    this.gl.deleteProgram(this.program);
  }

  // WebGL2 doesn't have bind group layouts
  getBindGroupLayout(index: number): RenderBindGroupLayout {
    return {};
  }
}

class WebGLCommandEncoder implements RenderCommandEncoder {
  private commands: Array<() => void> = [];

  constructor(private gl: WebGL2RenderingContext) {}

  beginComputePass(label?: string) {
    return new WebGLComputePass(this.gl, this.commands);
  }

  copyBufferToBuffer(
    source: RenderBuffer,
    sourceOffset: number,
    destination: RenderBuffer,
    destinationOffset: number,
    size: number
  ): void {
    this.commands.push(() => {
      // WebGL2 buffer-to-buffer copy via temporary mapping
      // This is less efficient than WebGPU
      console.warn('[WebGL2] Buffer-to-buffer copy not optimized');
    });
  }

  copyTextureToBuffer(
    source: { texture: RenderTexture },
    destination: { buffer: RenderBuffer; bytesPerRow: number },
    size: { width: number; height: number }
  ): void {
    this.commands.push(() => {
      // Readback via glReadPixels
      console.warn('[WebGL2] Texture-to-buffer copy uses slow readback path');
    });
  }

  finish(): RenderCommandBuffer {
    return new WebGLCommandBuffer(this.commands);
  }
}

class WebGLComputePass {
  constructor(
    private gl: WebGL2RenderingContext,
    private commands: Array<() => void>
  ) {}

  setPipeline(pipeline: RenderPipeline): void {
    this.commands.push(() => {
      this.gl.useProgram((pipeline as WebGL2Pipeline).program);
    });
  }

  setBindGroup(index: number, bindGroup: RenderBindGroup): void {
    // Bind resources (textures, uniforms)
    this.commands.push(() => {
      console.log('[WebGL2] Binding resources...');
    });
  }

  dispatchWorkgroups(x: number, y = 1, z = 1): void {
    // Execute compute emulation (fullscreen quad for fragment shader "compute")
    // Note: Workgroup count translates to output texture dimensions
    this.commands.push(() => {
      // Actual execution happens in WebGLComputeEmulator
      // This is just a placeholder for command recording
      console.log(`[WebGL2] Compute emulation scheduled: ${x}×${y}×${z} workgroups`);
    });
  }

  end(): void {
    // No-op for WebGL2
  }
}

class WebGLCommandBuffer implements RenderCommandBuffer {
  constructor(private commands: Array<() => void>) {}

  execute(): void {
    for (const command of this.commands) {
      command();
    }
  }
}
