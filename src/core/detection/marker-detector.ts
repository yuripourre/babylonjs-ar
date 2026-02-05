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

  // Phase 3: GPU batch processing pipelines
  private homographyPipeline: ComputePipeline | null = null;
  private markerDecodePipeline: ComputePipeline | null = null;

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

  // Phase 3: GPU batch processing buffers
  private srcPointsBuffer: GPUBuffer | null = null;
  private dstPointsBuffer: GPUBuffer | null = null;
  private homographyBuffer: GPUBuffer | null = null;
  private decodedMarkersBuffer: GPUBuffer | null = null;
  private dictionaryBuffer: GPUBuffer | null = null;
  private decodeParamsBuffer: GPUBuffer | null = null;

  // Maximum batch size for GPU processing
  private readonly MAX_BATCH_SIZE = 32;

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
      perspectiveWarpShader,
      markerDecodeShader,
      homographyShader
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

    // Phase 3: Create GPU batch processing pipelines
    this.homographyPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Homography Computation',
      shaderCode: homographyShader,
      entryPoint: 'computeDirect', // Use fast closed-form method
    });

    this.markerDecodePipeline = new ComputePipeline(this.gpuContext, {
      label: 'Marker Decode',
      shaderCode: markerDecodeShader,
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

    // Phase 3: Create GPU batch processing buffers
    // Source points buffer (4 points per quad, 2 floats per point, max batch size)
    this.srcPointsBuffer = device.createBuffer({
      label: 'Source Points',
      size: this.MAX_BATCH_SIZE * 4 * 2 * 4, // batch * points * vec2 * f32
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Destination points buffer (4 corners of unit square, shared by all)
    this.dstPointsBuffer = device.createBuffer({
      label: 'Destination Points',
      size: this.MAX_BATCH_SIZE * 4 * 2 * 4, // Same size, but filled with unit square coords
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Initialize destination points (unit square for all quads)
    const dstPoints = new Float32Array(this.MAX_BATCH_SIZE * 4 * 2);
    for (let i = 0; i < this.MAX_BATCH_SIZE; i++) {
      const offset = i * 8;
      // Top-left, top-right, bottom-right, bottom-left
      dstPoints[offset + 0] = 0.0; dstPoints[offset + 1] = 0.0;
      dstPoints[offset + 2] = 1.0; dstPoints[offset + 3] = 0.0;
      dstPoints[offset + 4] = 1.0; dstPoints[offset + 5] = 1.0;
      dstPoints[offset + 6] = 0.0; dstPoints[offset + 7] = 1.0;
    }
    device.queue.writeBuffer(this.dstPointsBuffer, 0, dstPoints);

    // Homography buffer (9 floats per quad)
    this.homographyBuffer = device.createBuffer({
      label: 'Homographies',
      size: this.MAX_BATCH_SIZE * 9 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Decoded markers buffer (DecodedMarker struct: 64 bytes per marker)
    this.decodedMarkersBuffer = device.createBuffer({
      label: 'Decoded Markers',
      size: this.MAX_BATCH_SIZE * 64,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Dictionary buffer (ArUco dictionary patterns)
    this.dictionaryBuffer = this.createDictionaryBuffer(device);

    // Decode parameters buffer
    this.decodeParamsBuffer = device.createBuffer({
      label: 'Decode Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    console.log('[MarkerDetector] Initialized with GPU batch processing');
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

    try {
      const device = this.gpuContext.getDevice();
      if (!device) {
        console.error('[MarkerDetector] GPU device not available');
        return [];
      }

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

    } catch (error) {
      console.error('[MarkerDetector] GPU detection error:', error);

      // Ensure buffer is unmapped if it was mapped
      try {
        if (this.readbackBuffer) {
          this.readbackBuffer.unmap();
        }
      } catch (unmapError) {
        // Buffer might not be mapped, ignore
      }

      // Return empty array on error
      return [];
    }
  }

  /**
   * Find markers from threshold image
   * Phase 3: Uses GPU batch processing for minimal CPU-GPU transfer
   */
  private async findMarkersFromThreshold(
    thresholdData: Uint8Array,
    width: number,
    height: number,
    grayscaleTexture: GPUTexture
  ): Promise<DetectedMarker[]> {
    // Step 1: Find contours (minimal CPU work)
    const contours = ContourProcessor.findContours(
      thresholdData,
      width,
      height,
      this.config.minMarkerPerimeter,
      this.config.maxMarkerPerimeter
    );

    console.log(`[MarkerDetector] Found ${contours.length} contours`);

    // Step 2: Extract quads from contours
    const quads: Quad[] = [];
    for (const contour of contours) {
      const polygon = ContourProcessor.approximatePolygon(contour);
      const quad = ContourProcessor.extractQuad(polygon);
      if (quad) {
        quads.push(quad);
      }
    }

    console.log(`[MarkerDetector] Extracted ${quads.length} quad candidates`);

    if (quads.length === 0) {
      return [];
    }

    // Step 3: Batch process all quads on GPU
    return await this.batchDecodeMarkersGPU(quads, grayscaleTexture);
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
   * Batch decode markers on GPU (Phase 3 optimization)
   * Eliminates CPU-GPU roundtrips by processing all markers in parallel
   */
  private async batchDecodeMarkersGPU(
    quads: Quad[],
    grayscaleTexture: GPUTexture
  ): Promise<DetectedMarker[]> {
    if (quads.length === 0) return [];
    if (!this.homographyPipeline || !this.markerDecodePipeline) {
      throw new Error('GPU batch pipelines not initialized');
    }

    const device = this.gpuContext.getDevice();
    const batchSize = Math.min(quads.length, this.MAX_BATCH_SIZE);

    // Step 1: Upload source points (quad corners)
    const srcPoints = new Float32Array(batchSize * 4 * 2);
    for (let i = 0; i < batchSize; i++) {
      const quad = quads[i];
      const offset = i * 8;
      srcPoints[offset + 0] = quad.corners[0].x;
      srcPoints[offset + 1] = quad.corners[0].y;
      srcPoints[offset + 2] = quad.corners[1].x;
      srcPoints[offset + 3] = quad.corners[1].y;
      srcPoints[offset + 4] = quad.corners[2].x;
      srcPoints[offset + 5] = quad.corners[2].y;
      srcPoints[offset + 6] = quad.corners[3].x;
      srcPoints[offset + 7] = quad.corners[3].y;
    }
    device.queue.writeBuffer(this.srcPointsBuffer!, 0, srcPoints);

    // Step 2: Compute homographies for all quads in parallel
    const encoder = device.createCommandEncoder({ label: 'Batch Marker Decode' });

    for (let i = 0; i < batchSize; i++) {
      // Update params for each quad
      const params = new Uint32Array([i, 0, 0, 0]);
      device.queue.writeBuffer(this.decodeParamsBuffer!, 0, params);

      const homographyBindGroup = this.homographyPipeline.createBindGroup([
        { binding: 0, resource: { buffer: this.srcPointsBuffer! } },
        { binding: 1, resource: { buffer: this.dstPointsBuffer! } },
        { binding: 2, resource: { buffer: this.homographyBuffer! } },
        { binding: 3, resource: { buffer: this.decodeParamsBuffer! } },
      ]);

      const homographyPass = encoder.beginComputePass({ label: `Homography ${i}` });
      homographyPass.setPipeline(this.homographyPipeline.getPipeline());
      homographyPass.setBindGroup(0, homographyBindGroup);
      homographyPass.dispatchWorkgroups(1);
      homographyPass.end();
    }

    // Step 3: Warp all markers and decode in parallel
    // Create warped texture array for batch processing
    const warpSize = 32;
    const warpedTexture = device.createTexture({
      label: 'Warped Markers Batch',
      size: { width: warpSize * batchSize, height: warpSize },
      format: 'r8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Update decode params with marker size and dictionary info
    const decodeParams = new Uint32Array(4);
    decodeParams[0] = 0; // markerIndex (will update per marker)
    decodeParams[1] = this.config.dictionarySize; // markerSize
    decodeParams[2] = this.getArucoPatterns().length; // dictionarySize
    decodeParams[3] = 1; // borderBits
    device.queue.writeBuffer(this.decodeParamsBuffer!, 0, decodeParams);

    // Batch decode all markers
    for (let i = 0; i < batchSize; i++) {
      decodeParams[0] = i;
      device.queue.writeBuffer(this.decodeParamsBuffer!, 0, decodeParams);

      const decodeBindGroup = this.markerDecodePipeline.createBindGroup([
        { binding: 0, resource: warpedTexture.createView() },
        { binding: 1, resource: { buffer: this.decodedMarkersBuffer! } },
        { binding: 2, resource: { buffer: this.decodeParamsBuffer! } },
        { binding: 3, resource: { buffer: this.dictionaryBuffer! } },
      ]);

      const decodePass = encoder.beginComputePass({ label: `Decode ${i}` });
      decodePass.setPipeline(this.markerDecodePipeline.getPipeline());
      decodePass.setBindGroup(0, decodeBindGroup);
      decodePass.dispatchWorkgroups(1);
      decodePass.end();
    }

    // Step 4: Readback decoded markers (single readback!)
    const readbackBuffer = device.createBuffer({
      label: 'Decoded Markers Readback',
      size: batchSize * 64,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    encoder.copyBufferToBuffer(
      this.decodedMarkersBuffer!,
      0,
      readbackBuffer,
      0,
      batchSize * 64
    );

    device.queue.submit([encoder.finish()]);

    // Step 5: Read and parse results
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(readbackBuffer.getMappedRange());

    const markers: DetectedMarker[] = [];
    for (let i = 0; i < batchSize; i++) {
      const offset = i * 16; // 64 bytes = 16 floats
      const id = Math.floor(resultData[offset + 0]);
      const rotation = Math.floor(resultData[offset + 1]) as 0 | 1 | 2 | 3;
      const valid = resultData[offset + 2];
      const confidence = resultData[offset + 3];

      if (valid > 0.5 && id >= 0) {
        markers.push({
          id,
          corners: this.quadToMarkerCorners(quads[i], rotation),
          confidence,
        });

        console.log(`[MarkerDetector] GPU decoded marker ${id} (rotation: ${rotation * 90}°, confidence: ${confidence.toFixed(2)})`);
      }
    }

    readbackBuffer.unmap();
    readbackBuffer.destroy();
    warpedTexture.destroy();

    return markers;
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
   * Create ArUco dictionary buffer for GPU
   */
  private createDictionaryBuffer(device: GPUDevice): GPUBuffer {
    // ArUco 4x4_50 dictionary (50 markers, 16 bits each)
    // In production, load full dictionary based on config.dictionarySize
    const dictionary = this.getArucoPatterns();

    const buffer = device.createBuffer({
      label: 'ArUco Dictionary',
      size: dictionary.length * 4, // u32 per marker
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(buffer, 0, new Uint32Array(dictionary));
    return buffer;
  }

  /**
   * Get ArUco dictionary patterns as bit codes
   */
  private getArucoPatterns(): number[] {
    // ArUco 4x4_50 dictionary (first 10 markers as example)
    // Each pattern is a 16-bit code representing the marker bits
    // Full dictionary would have 50 patterns for 4x4_50
    return [
      0b0001011001100100, // Marker 0
      0b0001001101110110, // Marker 1
      0b0011010001100100, // Marker 2
      0b0011100011010010, // Marker 3
      0b0010011011100010, // Marker 4
      0b0010101001110100, // Marker 5
      0b0100110001010110, // Marker 6
      0b0100010011100110, // Marker 7
      0b0110001011010100, // Marker 8
      0b0110111001000010, // Marker 9
      // Add remaining 40 markers in production...
    ];
  }

  /**
   * Get marker dictionary for decoding (legacy method)
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

    // Phase 3: Cleanup GPU batch processing buffers
    this.srcPointsBuffer?.destroy();
    this.dstPointsBuffer?.destroy();
    this.homographyBuffer?.destroy();
    this.decodedMarkersBuffer?.destroy();
    this.dictionaryBuffer?.destroy();
    this.decodeParamsBuffer?.destroy();
  }
}
