/**
 * WebGPU Backend Implementation
 * Wraps WebGPU API with our unified interface
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
} from './backend';

export class WebGPUBackend implements RenderBackend {
  readonly type = 'webgpu' as const;

  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;

  async initialize(config: BackendConfig = {}): Promise<void> {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }

    // Request adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: config.powerPreference ?? 'high-performance',
    });

    if (!adapter) {
      throw new Error('Failed to request WebGPU adapter');
    }

    this.adapter = adapter as unknown as GPUAdapter;

    // Request device
    const device = await adapter.requestDevice();
    this.device = device as unknown as GPUDevice;

    console.log('[WebGPU] Initialized successfully');
  }

  destroy(): void {
    this.device?.destroy();
    this.device = null;
    this.adapter = null;
  }

  // Resource creation
  createTexture(descriptor: TextureDescriptor): RenderTexture {
    if (!this.device) throw new Error('Device not initialized');

    const gpuTexture = this.device.createTexture({
      label: descriptor.label,
      size: { width: descriptor.width, height: descriptor.height },
      format: this.mapTextureFormat(descriptor.format),
      usage: this.mapTextureUsage(descriptor.usage),
      mipLevelCount: descriptor.mipLevelCount,
    });

    return new WebGPUTexture(gpuTexture, descriptor.width, descriptor.height, descriptor.format as any);
  }

  createBuffer(descriptor: BufferDescriptor): RenderBuffer {
    if (!this.device) throw new Error('Device not initialized');

    const gpuBuffer = this.device.createBuffer({
      label: descriptor.label,
      size: descriptor.size,
      usage: this.mapBufferUsage(descriptor.usage),
    });

    return new WebGPUBuffer(gpuBuffer, descriptor.size, descriptor.usage);
  }

  createShader(descriptor: ShaderDescriptor): RenderShader {
    if (!this.device) throw new Error('Device not initialized');

    const module = this.device.createShaderModule({
      label: descriptor.label,
      code: descriptor.code,
    });

    return new WebGPUShader(module, descriptor.type);
  }

  createPipeline(descriptor: PipelineDescriptor): RenderPipeline {
    if (!this.device) throw new Error('Device not initialized');

    if (descriptor.compute) {
      const pipeline = this.device.createComputePipeline({
        label: descriptor.label,
        layout: 'auto',
        compute: {
          module: (descriptor.compute.shader as WebGPUShader).module,
          entryPoint: descriptor.compute.entryPoint ?? 'main',
        },
      });

      return new WebGPUComputePipeline(pipeline);
    }

    throw new Error('Only compute pipelines supported currently');
  }

  createBindGroupLayout(entries: any[]): RenderBindGroupLayout {
    if (!this.device) throw new Error('Device not initialized');

    const layout = this.device.createBindGroupLayout({ entries });
    return { _layout: layout };
  }

  createBindGroup(layout: RenderBindGroupLayout, entries: BindGroupEntry[]): RenderBindGroup {
    if (!this.device) throw new Error('Device not initialized');

    const gpuEntries = entries.map((entry) => {
      let resource: GPUBindingResource;

      if ('buffer' in entry.resource) {
        const buffer = entry.resource.buffer as WebGPUBuffer;
        resource = {
          buffer: buffer.buffer,
          offset: entry.resource.offset,
          size: entry.resource.size,
        };
      } else if (entry.resource instanceof WebGPUTexture) {
        resource = entry.resource.texture.createView();
      } else {
        resource = entry.resource;
      }

      return {
        binding: entry.binding,
        resource,
      };
    });

    const bindGroup = this.device.createBindGroup({
      layout: (layout as any)._layout,
      entries: gpuEntries,
    });

    return { _bindGroup: bindGroup };
  }

  createCommandEncoder(label?: string): RenderCommandEncoder {
    if (!this.device) throw new Error('Device not initialized');

    const encoder = this.device.createCommandEncoder({ label });
    return new WebGPUCommandEncoder(encoder);
  }

  submit(commandBuffers: RenderCommandBuffer[]): void {
    if (!this.device) throw new Error('Device not initialized');

    const gpuBuffers = commandBuffers.map((cb) => (cb as WebGPUCommandBuffer).buffer);
    this.device.queue.submit(gpuBuffers);
  }

  writeBuffer(buffer: RenderBuffer, offset: number, data: BufferSource): void {
    if (!this.device) throw new Error('Device not initialized');

    const gpuBuffer = (buffer as WebGPUBuffer).buffer;
    this.device.queue.writeBuffer(gpuBuffer, offset, data);
  }

  writeTexture(
    destination: { texture: RenderTexture },
    data: BufferSource,
    layout: { bytesPerRow: number },
    size: { width: number; height: number }
  ): void {
    if (!this.device) throw new Error('Device not initialized');

    const gpuTexture = (destination.texture as WebGPUTexture).texture;
    this.device.queue.writeTexture(
      { texture: gpuTexture },
      data,
      layout,
      size
    );
  }

  importExternalTexture(source: any): any {
    if (!this.device) throw new Error('Device not initialized');
    return this.device.importExternalTexture({ source });
  }

  supportsFeature(feature: string): boolean {
    // Check WebGPU features
    return this.adapter?.features.has(feature) ?? false;
  }

  getInfo() {
    return {
      type: 'webgpu' as const,
      features: Array.from(this.adapter?.features ?? []),
    };
  }

  // Helper methods
  private mapTextureFormat(format: string): GPUTextureFormat {
    return format as GPUTextureFormat;
  }

  private mapTextureUsage(usage: TextureUsage): GPUTextureUsageFlags {
    let flags = 0;
    if (usage & TextureUsage.COPY_SRC) flags |= GPUTextureUsage.COPY_SRC;
    if (usage & TextureUsage.COPY_DST) flags |= GPUTextureUsage.COPY_DST;
    if (usage & TextureUsage.TEXTURE) flags |= GPUTextureUsage.TEXTURE_BINDING;
    if (usage & TextureUsage.STORAGE) flags |= GPUTextureUsage.STORAGE_BINDING;
    if (usage & TextureUsage.RENDER_ATTACHMENT) flags |= GPUTextureUsage.RENDER_ATTACHMENT;
    return flags;
  }

  private mapBufferUsage(usage: BufferUsage): GPUBufferUsageFlags {
    let flags = 0;
    if (usage & BufferUsage.COPY_SRC) flags |= GPUBufferUsage.COPY_SRC;
    if (usage & BufferUsage.COPY_DST) flags |= GPUBufferUsage.COPY_DST;
    if (usage & BufferUsage.STORAGE) flags |= GPUBufferUsage.STORAGE;
    if (usage & BufferUsage.UNIFORM) flags |= GPUBufferUsage.UNIFORM;
    if (usage & BufferUsage.VERTEX) flags |= GPUBufferUsage.VERTEX;
    if (usage & BufferUsage.INDEX) flags |= GPUBufferUsage.INDEX;
    if (usage & BufferUsage.INDIRECT) flags |= GPUBufferUsage.INDIRECT;
    return flags;
  }
}

// Wrapper classes
class WebGPUTexture implements RenderTexture {
  constructor(
    public texture: GPUTexture,
    public readonly width: number,
    public readonly height: number,
    public readonly format: any
  ) {}

  destroy(): void {
    this.texture.destroy();
  }

  createView(): GPUTextureView {
    return this.texture.createView();
  }
}

class WebGPUBuffer implements RenderBuffer {
  constructor(
    public buffer: GPUBuffer,
    public size: number,
    public usage: number
  ) {}

  destroy(): void {
    this.buffer.destroy();
  }

  async mapAsync(mode: number): Promise<void> {
    await this.buffer.mapAsync(mode);
  }

  getMappedRange(offset?: number, size?: number): ArrayBuffer {
    return this.buffer.getMappedRange(offset, size);
  }

  unmap(): void {
    this.buffer.unmap();
  }
}

class WebGPUShader implements RenderShader {
  constructor(
    public module: GPUShaderModule,
    public type: 'compute' | 'vertex' | 'fragment'
  ) {}

  destroy(): void {
    // WebGPU shader modules don't have explicit destroy
  }
}

class WebGPUComputePipeline implements RenderPipeline {
  constructor(public pipeline: GPUComputePipeline) {}

  destroy(): void {
    // WebGPU pipelines don't have explicit destroy
  }

  getBindGroupLayout(index: number): RenderBindGroupLayout {
    const layout = this.pipeline.getBindGroupLayout(index);
    return { _layout: layout };
  }
}

class WebGPUCommandEncoder implements RenderCommandEncoder {
  constructor(private encoder: GPUCommandEncoder) {}

  beginComputePass(label?: string) {
    const pass = this.encoder.beginComputePass({ label });
    return new WebGPUComputePass(pass);
  }

  copyBufferToBuffer(
    source: RenderBuffer,
    sourceOffset: number,
    destination: RenderBuffer,
    destinationOffset: number,
    size: number
  ): void {
    this.encoder.copyBufferToBuffer(
      (source as WebGPUBuffer).buffer,
      sourceOffset,
      (destination as WebGPUBuffer).buffer,
      destinationOffset,
      size
    );
  }

  copyTextureToBuffer(
    source: { texture: RenderTexture },
    destination: { buffer: RenderBuffer; bytesPerRow: number },
    size: { width: number; height: number }
  ): void {
    this.encoder.copyTextureToBuffer(
      { texture: (source.texture as WebGPUTexture).texture },
      { buffer: (destination.buffer as WebGPUBuffer).buffer, bytesPerRow: destination.bytesPerRow },
      size
    );
  }

  finish(): RenderCommandBuffer {
    return new WebGPUCommandBuffer(this.encoder.finish());
  }
}

class WebGPUComputePass {
  constructor(private pass: GPUComputePassEncoder) {}

  setPipeline(pipeline: RenderPipeline): void {
    this.pass.setPipeline((pipeline as WebGPUComputePipeline).pipeline);
  }

  setBindGroup(index: number, bindGroup: RenderBindGroup): void {
    this.pass.setBindGroup(index, (bindGroup as any)._bindGroup);
  }

  dispatchWorkgroups(x: number, y = 1, z = 1): void {
    this.pass.dispatchWorkgroups(x, y, z);
  }

  end(): void {
    this.pass.end();
  }
}

class WebGPUCommandBuffer implements RenderCommandBuffer {
  constructor(public buffer: GPUCommandBuffer) {}
}
