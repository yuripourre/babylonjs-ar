/**
 * Preprocessing Pipeline
 * Prepares images for depth estimation model input
 */

import type { ModelInfo } from './model-loader';

/**
 * Image preprocessing utilities
 */
export class ImagePreprocessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  /**
   * Preprocess image for model input
   * 1. Resize to model input size
   * 2. Normalize using model-specific mean/std
   * 3. Convert to CHW format (channels, height, width)
   */
  async preprocess(
    source: VideoFrame | HTMLVideoElement | ImageBitmap | HTMLCanvasElement,
    modelInfo: ModelInfo
  ): Promise<Float32Array> {
    const [targetWidth, targetHeight] = modelInfo.inputSize;

    // Resize image
    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;

    // Draw and extract pixels
    this.ctx.drawImage(source as any, 0, 0, targetWidth, targetHeight);
    const imageData = this.ctx.getImageData(0, 0, targetWidth, targetHeight);

    // Normalize and convert to CHW format
    return this.normalizeAndConvert(imageData, modelInfo);
  }

  /**
   * Normalize pixel values and convert from HWC to CHW format
   * HWC: [height, width, channels] - standard image format
   * CHW: [channels, height, width] - ML model format
   */
  private normalizeAndConvert(
    imageData: ImageData,
    modelInfo: ModelInfo
  ): Float32Array {
    const { width, height } = imageData;
    const pixels = imageData.data;
    const [meanR, meanG, meanB] = modelInfo.mean;
    const [stdR, stdG, stdB] = modelInfo.std;

    // Allocate tensor (CHW format)
    const tensor = new Float32Array(3 * width * height);

    // Convert HWC → CHW and normalize
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        const tensorIndex = y * width + x;

        // Extract RGB (0-255)
        const r = pixels[pixelIndex] / 255.0;
        const g = pixels[pixelIndex + 1] / 255.0;
        const b = pixels[pixelIndex + 2] / 255.0;

        // Normalize: (pixel - mean) / std
        const rNorm = (r - meanR) / stdR;
        const gNorm = (g - meanG) / stdG;
        const bNorm = (b - meanB) / stdB;

        // Store in CHW format
        tensor[tensorIndex] = rNorm;                          // R channel
        tensor[width * height + tensorIndex] = gNorm;         // G channel
        tensor[2 * width * height + tensorIndex] = bNorm;     // B channel
      }
    }

    return tensor;
  }

  /**
   * Postprocess model output to depth map
   * Converts raw model output to normalized depth values
   */
  postprocess(
    output: Float32Array,
    width: number,
    height: number
  ): Float32Array {
    // Find min/max for normalization
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < output.length; i++) {
      const val = output[i];
      if (val < min) {min = val;}
      if (val > max) {max = val;}
    }

    // Normalize to [0, 1]
    const normalized = new Float32Array(width * height);
    const range = max - min;

    if (range > 0) {
      for (let i = 0; i < output.length; i++) {
        // Invert depth (closer = higher value in output, but we want closer = lower value)
        normalized[i] = 1.0 - ((output[i] - min) / range);
      }
    } else {
      // Uniform depth if no variation
      normalized.fill(0.5);
    }

    return normalized;
  }

  /**
   * Resize depth map to match target resolution
   */
  resizeDepth(
    depthData: Float32Array,
    srcWidth: number,
    srcHeight: number,
    dstWidth: number,
    dstHeight: number
  ): Float32Array {
    const resized = new Float32Array(dstWidth * dstHeight);

    const scaleX = srcWidth / dstWidth;
    const scaleY = srcHeight / dstHeight;

    for (let y = 0; y < dstHeight; y++) {
      for (let x = 0; x < dstWidth; x++) {
        const srcX = x * scaleX;
        const srcY = y * scaleY;

        // Bilinear interpolation
        const depth = this.bilinearSample(
          depthData,
          srcWidth,
          srcHeight,
          srcX,
          srcY
        );

        resized[y * dstWidth + x] = depth;
      }
    }

    return resized;
  }

  /**
   * Bilinear interpolation sampling
   */
  private bilinearSample(
    data: Float32Array,
    width: number,
    height: number,
    x: number,
    y: number
  ): number {
    const x0 = Math.floor(x);
    const x1 = Math.min(x0 + 1, width - 1);
    const y0 = Math.floor(y);
    const y1 = Math.min(y0 + 1, height - 1);

    const fx = x - x0;
    const fy = y - y0;

    const v00 = data[y0 * width + x0];
    const v10 = data[y0 * width + x1];
    const v01 = data[y1 * width + x0];
    const v11 = data[y1 * width + x1];

    const v0 = v00 * (1 - fx) + v10 * fx;
    const v1 = v01 * (1 - fx) + v11 * fx;

    return v0 * (1 - fy) + v1 * fy;
  }

  /**
   * Apply temporal smoothing between depth maps
   */
  temporalSmooth(
    current: Float32Array,
    previous: Float32Array,
    alpha: number
  ): Float32Array {
    if (previous.length !== current.length) {
      return current;
    }

    const smoothed = new Float32Array(current.length);

    for (let i = 0; i < current.length; i++) {
      smoothed[i] = previous[i] * (1 - alpha) + current[i] * alpha;
    }

    return smoothed;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Canvas will be garbage collected
  }
}

/**
 * WebGPU-accelerated preprocessing (optional, for high performance)
 */
export class GPUImagePreprocessor {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;

  async initialize(device: GPUDevice): Promise<void> {
    this.device = device;

    // Create compute pipeline for preprocessing
    const shaderCode = `
      @group(0) @binding(0) var inputTexture: texture_2d<f32>;
      @group(0) @binding(1) var<storage, read_write> outputBuffer: array<f32>;
      @group(0) @binding(2) var<uniform> params: vec4<f32>; // mean.rgb, std.r
      @group(0) @binding(3) var<uniform> params2: vec4<f32>; // std.gb, unused

      @compute @workgroup_size(8, 8)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let dims = textureDimensions(inputTexture);
        if (global_id.x >= dims.x || global_id.y >= dims.y) {
          return;
        }

        let pixel = textureLoad(inputTexture, vec2<u32>(global_id.xy), 0);
        let idx = global_id.y * dims.x + global_id.x;

        // Normalize: (pixel - mean) / std
        let meanR = params.x;
        let meanG = params.y;
        let meanB = params.z;
        let stdR = params.w;
        let stdG = params2.x;
        let stdB = params2.y;

        let r = (pixel.r - meanR) / stdR;
        let g = (pixel.g - meanG) / stdG;
        let b = (pixel.b - meanB) / stdB;

        // Store in CHW format
        let pixelCount = dims.x * dims.y;
        outputBuffer[idx] = r;
        outputBuffer[pixelCount + idx] = g;
        outputBuffer[2u * pixelCount + idx] = b;
      }
    `;

    const shaderModule = device.createShaderModule({ code: shaderCode });

    this.pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
  }

  /**
   * Preprocess using GPU (much faster)
   */
  async preprocessGPU(
    texture: GPUTexture,
    modelInfo: ModelInfo
  ): Promise<Float32Array> {
    if (!this.device || !this.pipeline) {
      throw new Error('GPU preprocessor not initialized');
    }

    const [width, height] = modelInfo.inputSize;
    const outputSize = 3 * width * height * 4; // Float32 = 4 bytes

    // Create output buffer
    const outputBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create uniform buffers for parameters
    const params1 = new Float32Array([
      ...modelInfo.mean,
      modelInfo.std[0],
    ]);
    const params2 = new Float32Array([
      modelInfo.std[1],
      modelInfo.std[2],
      0,
      0,
    ]);

    const paramsBuffer1 = this.device.createBuffer({
      size: params1.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(paramsBuffer1, 0, params1);

    const paramsBuffer2 = this.device.createBuffer({
      size: params2.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(paramsBuffer2, 0, params2);

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0) as GPUBindGroupLayout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: { buffer: outputBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer1 } },
        { binding: 3, resource: { buffer: paramsBuffer2 } },
      ],
    });

    // Dispatch compute shader
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(width / 8),
      Math.ceil(height / 8)
    );
    passEncoder.end();

    // Read back results
    const readBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    commandEncoder.copyBufferToBuffer(
      outputBuffer,
      0,
      readBuffer,
      0,
      outputSize
    );

    this.device.queue.submit([commandEncoder.finish()]);

    // Map and read data
    await readBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readBuffer.getMappedRange());
    const copy = new Float32Array(result);
    readBuffer.unmap();

    // Cleanup
    outputBuffer.destroy();
    readBuffer.destroy();
    paramsBuffer1.destroy();
    paramsBuffer2.destroy();

    return copy;
  }

  destroy(): void {
    this.device = null;
    this.pipeline = null;
  }
}
