/**
 * ArUco Marker Detector
 * Detects and decodes ArUco markers from camera feed
 */

import type { GPUContextManager } from '../gpu/gpu-context';
import { ComputePipeline, calculateWorkgroupCount } from '../gpu/compute-pipeline';
import { Matrix4 } from '../math/matrix';
import { Vector3 } from '../math/vector';
import { ContourProcessor, type Quad } from './contour-processor';
import { ArucoDecoder } from './aruco-decoder';
import { Homography } from '../math/homography';

export interface MarkerCorners {
  topLeft: [number, number];
  topRight: [number, number];
  bottomRight: [number, number];
  bottomLeft: [number, number];
}

export interface DetectedMarker {
  id: number;
  corners: MarkerCorners;
  confidence: number;
}

export interface MarkerDetectorConfig {
  markerSize?: number;       // Physical marker size in meters
  dictionarySize?: 4 | 5 | 6; // ArUco dictionary (4x4, 5x5, 6x6)
  minMarkerPerimeter?: number;
  maxMarkerPerimeter?: number;
  adaptiveThresholdBlockSize?: number;
  adaptiveThresholdConstant?: number;
}

export class MarkerDetector {
  private gpuContext: GPUContextManager;
  private config: Required<MarkerDetectorConfig>;

  // GPU pipelines
  private blurPipeline: ComputePipeline | null = null;
  private thresholdPipeline: ComputePipeline | null = null;
  private contourPipeline: ComputePipeline | null = null;
  private cornerPipeline: ComputePipeline | null = null;
  private warpPipeline: ComputePipeline | null = null;

  // GPU textures
  private blurredTexture: GPUTexture | null = null;
  private thresholdTexture: GPUTexture | null = null;
  private contourTexture: GPUTexture | null = null;
  private cornerTexture: GPUTexture | null = null;

  // GPU buffers
  private blurParamsBuffer: GPUBuffer | null = null;
  private thresholdParamsBuffer: GPUBuffer | null = null;
  private cornerParamsBuffer: GPUBuffer | null = null;

  // Readback buffer for CPU processing
  private readbackBuffer: GPUBuffer | null = null;

  constructor(gpuContext: GPUContextManager, config: MarkerDetectorConfig = {}) {
    this.gpuContext = gpuContext;
    this.config = {
      markerSize: config.markerSize ?? 0.1, // 10cm default
      dictionarySize: config.dictionarySize ?? 4,
      minMarkerPerimeter: config.minMarkerPerimeter ?? 80,
      maxMarkerPerimeter: config.maxMarkerPerimeter ?? 2000,
      adaptiveThresholdBlockSize: config.adaptiveThresholdBlockSize ?? 15,
      adaptiveThresholdConstant: config.adaptiveThresholdConstant ?? 7,
    };
  }

  /**
   * Initialize detector with image dimensions
   */
  async initialize(width: number, height: number): Promise<void> {
    const device = this.gpuContext.getDevice();

    // Load shaders (these will be imported from the shader index)
    const {
      gaussianBlurShader,
      adaptiveThresholdShader,
      contourDetectionShader,
      cornerDetectionShader,
      perspectiveWarpShader
    } = await import('../../shaders/marker-shaders');

    // Create blur pipeline
    this.blurPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Gaussian Blur',
      shaderCode: gaussianBlurShader,
    });

    // Create threshold pipeline
    this.thresholdPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Adaptive Threshold',
      shaderCode: adaptiveThresholdShader,
    });

    // Create contour pipeline
    this.contourPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Contour Detection',
      shaderCode: contourDetectionShader,
    });

    // Create corner detection pipeline
    this.cornerPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Corner Detection',
      shaderCode: cornerDetectionShader,
    });

    // Create textures
    this.blurredTexture = device.createTexture({
      label: 'Blurred',
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.thresholdTexture = device.createTexture({
      label: 'Threshold',
      size: { width, height },
      format: 'r8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    this.contourTexture = device.createTexture({
      label: 'Contours',
      size: { width, height },
      format: 'r32uint',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.cornerTexture = device.createTexture({
      label: 'Corners',
      size: { width, height },
      format: 'rgba32float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    // Create parameter buffers
    this.blurParamsBuffer = device.createBuffer({
      label: 'Blur Params',
      size: 16, // vec2 + f32 + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.thresholdParamsBuffer = device.createBuffer({
      label: 'Threshold Params',
      size: 16, // u32 + f32 + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.cornerParamsBuffer = device.createBuffer({
      label: 'Corner Params',
      size: 16, // f32 + f32 + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Initialize parameters
    this.updateBlurParams(1.0, 0.0); // Horizontal pass
    this.updateThresholdParams();
    this.updateCornerParams();

    // Create readback buffer for CPU processing
    const readbackSize = width * height; // R8 (threshold texture)
    this.readbackBuffer = device.createBuffer({
      label: 'Readback',
      size: readbackSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    console.log('[MarkerDetector] Initialized');
  }

  /**
   * Update blur parameters
   */
  private updateBlurParams(dirX: number, dirY: number): void {
    const data = new Float32Array([dirX, dirY, 1.0, 0.0]);
    this.gpuContext.writeBuffer(this.blurParamsBuffer!, 0, data);
  }

  /**
   * Update threshold parameters
   */
  private updateThresholdParams(): void {
    const data = new Uint32Array(4);
    data[0] = this.config.adaptiveThresholdBlockSize;
    const floatView = new Float32Array(data.buffer);
    floatView[1] = this.config.adaptiveThresholdConstant;
    this.gpuContext.writeBuffer(this.thresholdParamsBuffer!, 0, data);
  }

  /**
   * Update corner detection parameters
   */
  private updateCornerParams(): void {
    const data = new Float32Array([0.01, 0.04, 0.0, 0.0]); // threshold, k
    this.gpuContext.writeBuffer(this.cornerParamsBuffer!, 0, data);
  }

  /**
   * Detect markers in grayscale image
   */
  async detect(grayscaleTexture: GPUTexture): Promise<DetectedMarker[]> {
    if (!this.blurPipeline || !this.thresholdPipeline || !this.contourPipeline || !this.cornerPipeline) {
      throw new Error('Detector not initialized');
    }

    const device = this.gpuContext.getDevice();
    const encoder = device.createCommandEncoder({ label: 'Marker Detection' });

    const width = grayscaleTexture.width;
    const height = grayscaleTexture.height;
    const workgroupCount = calculateWorkgroupCount(width, height, { x: 16, y: 16 });

    // Step 1: Gaussian blur (two-pass separable)
    // Horizontal pass
    this.updateBlurParams(1.0, 0.0);
    const blurHBindGroup = this.blurPipeline.createBindGroup([
      { binding: 0, resource: grayscaleTexture.createView() },
      { binding: 1, resource: this.blurredTexture!.createView() },
      { binding: 2, resource: { buffer: this.blurParamsBuffer! } },
    ]);

    const blurHPass = encoder.beginComputePass({ label: 'Blur Horizontal' });
    blurHPass.setPipeline(this.blurPipeline.getPipeline());
    blurHPass.setBindGroup(0, blurHBindGroup);
    blurHPass.dispatchWorkgroups(workgroupCount.x, workgroupCount.y);
    blurHPass.end();

    // Vertical pass (reuse blurred texture as input/output with temp texture)
    // For simplicity, we'll skip the second pass for now and just use horizontal

    // Step 2: Adaptive threshold
    const thresholdBindGroup = this.thresholdPipeline.createBindGroup([
      { binding: 0, resource: this.blurredTexture!.createView() },
      { binding: 1, resource: this.thresholdTexture!.createView() },
      { binding: 2, resource: { buffer: this.thresholdParamsBuffer! } },
    ]);

    const thresholdPass = encoder.beginComputePass({ label: 'Adaptive Threshold' });
    thresholdPass.setPipeline(this.thresholdPipeline.getPipeline());
    thresholdPass.setBindGroup(0, thresholdBindGroup);
    thresholdPass.dispatchWorkgroups(workgroupCount.x, workgroupCount.y);
    thresholdPass.end();

    // Step 3: Contour detection
    const contourBindGroup = this.contourPipeline.createBindGroup([
      { binding: 0, resource: this.thresholdTexture!.createView() },
      { binding: 1, resource: this.contourTexture!.createView() },
    ]);

    const contourPass = encoder.beginComputePass({ label: 'Contour Detection' });
    contourPass.setPipeline(this.contourPipeline.getPipeline());
    contourPass.setBindGroup(0, contourBindGroup);
    contourPass.dispatchWorkgroups(workgroupCount.x, workgroupCount.y);
    contourPass.end();

    // Copy threshold data to readback buffer for CPU processing
    encoder.copyTextureToBuffer(
      { texture: this.thresholdTexture! },
      { buffer: this.readbackBuffer!, bytesPerRow: width },
      { width, height }
    );

    device.queue.submit([encoder.finish()]);

    // Read back threshold data and process on CPU
    await this.readbackBuffer!.mapAsync(GPUMapMode.READ);
    const thresholdData = new Uint8Array(this.readbackBuffer!.getMappedRange());

    // Process threshold image to find markers
    const markers = await this.findMarkersFromThreshold(
      thresholdData,
      width,
      height,
      grayscaleTexture
    );

    this.readbackBuffer!.unmap();

    return markers;
  }

  /**
   * Find markers from threshold image (CPU processing)
   */
  private async findMarkersFromThreshold(
    thresholdData: Uint8Array,
    width: number,
    height: number,
    grayscaleTexture: GPUTexture
  ): Promise<DetectedMarker[]> {
    const markers: DetectedMarker[] = [];

    // Step 1: Find contours
    const contours = ContourProcessor.findContours(
      thresholdData,
      width,
      height,
      this.config.minMarkerPerimeter,
      this.config.maxMarkerPerimeter
    );

    console.log(`[MarkerDetector] Found ${contours.length} contours`);

    // Step 2: Process each contour
    for (const contour of contours) {
      // Approximate to polygon
      const polygon = ContourProcessor.approximatePolygon(contour);

      // Try to extract quad
      const quad = ContourProcessor.extractQuad(polygon);
      if (!quad) continue;

      // Step 3: Warp marker to square and decode
      const decoded = await this.decodeMarker(quad, grayscaleTexture);
      if (decoded) {
        markers.push({
          id: decoded.id,
          corners: this.quadToMarkerCorners(quad, decoded.rotation),
          confidence: Math.max(0, 1.0 - decoded.hamming / 16), // Normalize hamming to confidence
        });

        console.log(`[MarkerDetector] Detected marker ${decoded.id} (rotation: ${decoded.rotation * 90}°)`);
      }
    }

    return markers;
  }

  /**
   * Decode marker from quad
   */
  private async decodeMarker(
    quad: Quad,
    grayscaleTexture: GPUTexture
  ): Promise<{ id: number; rotation: 0 | 1 | 2 | 3; hamming: number } | null> {
    const device = this.gpuContext.getDevice();

    // Warp marker to 32x32 square
    const warpSize = 32;

    // Compute homography
    const homography = Homography.quadToSquare(quad.corners, warpSize);

    // Create output texture for warped marker
    const warpedTexture = device.createTexture({
      size: { width: warpSize, height: warpSize },
      format: 'r8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    // Create sampler
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Create homography buffer
    const homographyBuffer = device.createBuffer({
      size: 48, // 12 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(homographyBuffer, 0, homography.buffer);

    // Create warp pipeline if needed
    if (!this.warpPipeline) {
      const { perspectiveWarpShader } = await import('../../shaders/marker-shaders');
      this.warpPipeline = new ComputePipeline(this.gpuContext, {
        label: 'Perspective Warp',
        shaderCode: perspectiveWarpShader,
      });
    }

    // Execute warp
    const warpBindGroup = this.warpPipeline.createBindGroup([
      { binding: 0, resource: grayscaleTexture.createView() },
      { binding: 1, resource: sampler },
      { binding: 2, resource: warpedTexture.createView() },
      { binding: 3, resource: { buffer: homographyBuffer } },
    ]);

    const warpCount = calculateWorkgroupCount(warpSize, warpSize, { x: 8, y: 8 });

    const encoder = device.createCommandEncoder();
    const warpPass = encoder.beginComputePass();
    warpPass.setPipeline(this.warpPipeline.getPipeline());
    warpPass.setBindGroup(0, warpBindGroup);
    warpPass.dispatchWorkgroups(warpCount.x, warpCount.y);
    warpPass.end();

    // Read back warped image
    const warpReadbackBuffer = device.createBuffer({
      size: warpSize * warpSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    encoder.copyTextureToBuffer(
      { texture: warpedTexture },
      { buffer: warpReadbackBuffer, bytesPerRow: warpSize },
      { width: warpSize, height: warpSize }
    );

    device.queue.submit([encoder.finish()]);

    await warpReadbackBuffer.mapAsync(GPUMapMode.READ);
    const warpedData = new Uint8Array(warpReadbackBuffer.getMappedRange());

    // Verify border
    if (!ArucoDecoder.verifyBorder(warpedData, warpSize, this.config.dictionarySize)) {
      warpReadbackBuffer.unmap();
      warpedTexture.destroy();
      homographyBuffer.destroy();
      warpReadbackBuffer.destroy();
      return null;
    }

    // Extract and decode bits
    const decoder = new ArucoDecoder(this.config.dictionarySize);
    const bits = decoder.extractBits(warpedData, warpSize, this.config.dictionarySize);
    const decoded = decoder.decode(bits);

    // Cleanup
    warpReadbackBuffer.unmap();
    warpedTexture.destroy();
    homographyBuffer.destroy();
    warpReadbackBuffer.destroy();

    return decoded;
  }

  /**
   * Convert quad corners to marker corners accounting for rotation
   */
  private quadToMarkerCorners(quad: Quad, rotation: 0 | 1 | 2 | 3): MarkerCorners {
    // Rotate corners to match marker orientation
    const corners = quad.corners.slice();

    for (let i = 0; i < rotation; i++) {
      corners.unshift(corners.pop()!);
    }

    return {
      topLeft: [corners[0].x, corners[0].y],
      topRight: [corners[1].x, corners[1].y],
      bottomRight: [corners[2].x, corners[2].y],
      bottomLeft: [corners[3].x, corners[3].y],
    };
  }

  /**
   * Get marker dictionary for decoding
   */
  private getMarkerDictionary(): Map<number, number[]> {
    // ArUco 4x4 dictionary (simplified subset)
    // In full implementation, load complete dictionary
    const dictionary = new Map<number, number[]>();

    // Dictionary entries: marker ID -> bit pattern (16 bits for 4x4)
    // Example: marker 0
    dictionary.set(0, [
      0, 0, 0, 0,
      0, 1, 1, 0,
      0, 1, 1, 0,
      0, 0, 0, 0,
    ]);

    return dictionary;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.blurredTexture?.destroy();
    this.thresholdTexture?.destroy();
    this.contourTexture?.destroy();
    this.cornerTexture?.destroy();
    this.blurParamsBuffer?.destroy();
    this.thresholdParamsBuffer?.destroy();
    this.cornerParamsBuffer?.destroy();
    this.readbackBuffer?.destroy();
  }
}
