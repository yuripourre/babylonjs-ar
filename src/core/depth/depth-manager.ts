/**
 * Depth Manager
 * Manages depth estimation pipeline: GPU stereo matching → depth map → point cloud
 *
 * Pipeline:
 * 1. Stereo matching compute shader (GPU)
 * 2. Depth map readback (GPU → CPU)
 * 3. Point cloud generation (CPU)
 * 4. Depth refinement (bilateral filtering, upsampling)
 */

import { GPUContextManager } from '../gpu/gpu-context';
import { ComputePipeline } from '../gpu/compute-pipeline';
import { PointCloudGenerator, type Point3D } from '../detection/point-cloud';
import type { CameraIntrinsics } from '../tracking/pose-estimator';
import { Vector3 } from '../math/vector';
import { depthShaders } from '../../shaders/depth-shaders';

export interface DepthConfig {
  width: number;
  height: number;
  minDisparity?: number; // Minimum disparity to search (default: 0)
  maxDisparity?: number; // Maximum disparity to search (default: 64)
  windowSize?: number; // SAD window size (default: 9)
  uniquenessRatio?: number; // Uniqueness check ratio (default: 0.15)
  hierarchical?: boolean; // Use hierarchical matching (default: true)
}

export interface DepthFrame {
  depthMap: Float32Array; // Depth values in meters
  pointCloud: Float32Array; // 3D points (vec4 format: x, y, z, valid)
  normals?: Float32Array; // Normal vectors (vec4 format: nx, ny, nz, confidence)
  confidence: Float32Array; // Confidence per pixel (0-1)
  timestamp: number;
}

export class DepthManager {
  private gpuContext: GPUContextManager;
  private config: Required<DepthConfig>;
  private intrinsics: CameraIntrinsics;

  // GPU resources
  private stereoMatchingPipeline: ComputePipeline | null = null;
  private depthRefinementPipeline: ComputePipeline | null = null;

  // Buffers
  private leftImageBuffer: GPUBuffer | null = null;
  private rightImageBuffer: GPUBuffer | null = null;
  private disparityBuffer: GPUBuffer | null = null;
  private depthBuffer: GPUBuffer | null = null;
  private confidenceBuffer: GPUBuffer | null = null;
  private readbackBuffer: GPUBuffer | null = null;

  // CPU processing
  private pointCloudGenerator: PointCloudGenerator;

  // Cache
  private lastDepthFrame: DepthFrame | null = null;

  constructor(
    gpuContext: GPUContextManager,
    intrinsics: CameraIntrinsics,
    config: DepthConfig
  ) {
    this.gpuContext = gpuContext;
    this.intrinsics = intrinsics;
    this.config = {
      width: config.width,
      height: config.height,
      minDisparity: config.minDisparity ?? 0,
      maxDisparity: config.maxDisparity ?? 64,
      windowSize: config.windowSize ?? 9,
      uniquenessRatio: config.uniquenessRatio ?? 0.15,
      hierarchical: config.hierarchical ?? true,
    };

    this.pointCloudGenerator = new PointCloudGenerator(intrinsics);
  }

  /**
   * Initialize GPU pipelines and buffers
   */
  async initialize(): Promise<void> {
    const device = this.gpuContext.getDevice();
    const { width, height } = this.config;
    const pixelCount = width * height;

    // Create buffers
    this.leftImageBuffer = device.createBuffer({
      size: pixelCount * 4, // RGBA
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.rightImageBuffer = device.createBuffer({
      size: pixelCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.disparityBuffer = device.createBuffer({
      size: pixelCount * 4, // f32 per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.depthBuffer = device.createBuffer({
      size: pixelCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.confidenceBuffer = device.createBuffer({
      size: pixelCount * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    this.readbackBuffer = device.createBuffer({
      size: pixelCount * 4 * 2, // Depth + confidence
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Create stereo matching pipeline
    this.stereoMatchingPipeline = new ComputePipeline(this.gpuContext, {
      label: 'stereo-matching',
      shaderCode: depthShaders.stereoMatching,
      entryPoint: 'main',
    });

    // Create depth refinement pipeline
    this.depthRefinementPipeline = new ComputePipeline(this.gpuContext, {
      label: 'depth-refinement',
      shaderCode: depthShaders.depthRefinement,
      entryPoint: 'main',
    });

    console.log('[DepthManager] Initialized');
  }

  /**
   * Compute depth map from stereo image pair
   */
  async computeDepth(
    leftImage: Uint8Array,
    rightImage: Uint8Array,
    baseline: number = 0.12, // 12cm baseline (typical stereo camera)
    focalLength: number = this.intrinsics.fx
  ): Promise<DepthFrame> {
    if (!this.stereoMatchingPipeline) {
      throw new Error('DepthManager not initialized');
    }

    const device = this.gpuContext.getDevice();
    const { width, height } = this.config;

    // Upload images to GPU
    device.queue.writeBuffer(this.leftImageBuffer!, 0, leftImage.buffer);
    device.queue.writeBuffer(this.rightImageBuffer!, 0, rightImage.buffer);

    // Create parameter buffer
    const params = new Float32Array([
      width,
      height,
      this.config.minDisparity,
      this.config.maxDisparity,
      this.config.windowSize,
      this.config.uniquenessRatio,
      baseline,
      focalLength,
      this.config.hierarchical ? 1 : 0,
    ]);

    const paramBuffer = device.createBuffer({
      size: params.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paramBuffer, 0, params.buffer);

    // Create bind group for stereo matching
    const stereoBindGroup = this.stereoMatchingPipeline.createBindGroup([
      { binding: 0, resource: { buffer: this.leftImageBuffer! } },
      { binding: 1, resource: { buffer: this.rightImageBuffer! } },
      { binding: 2, resource: { buffer: this.disparityBuffer! } },
      { binding: 3, resource: { buffer: this.confidenceBuffer! } },
      { binding: 4, resource: { buffer: paramBuffer } },
    ]);

    // Run stereo matching
    this.stereoMatchingPipeline.executeAndSubmit(
      stereoBindGroup,
      { x: Math.ceil(width / 16), y: Math.ceil(height / 16), z: 1 }
    );

    // Convert disparity to depth on GPU
    await this.disparityToDepth(baseline, focalLength);

    // Refine depth (bilateral filter)
    if (this.depthRefinementPipeline) {
      const refinementBindGroup = this.depthRefinementPipeline.createBindGroup([
        { binding: 0, resource: { buffer: this.depthBuffer! } },
        { binding: 1, resource: { buffer: this.depthBuffer! } }, // In-place refinement
        { binding: 2, resource: { buffer: paramBuffer } },
      ]);

      this.depthRefinementPipeline.executeAndSubmit(
        refinementBindGroup,
        { x: Math.ceil(width / 16), y: Math.ceil(height / 16), z: 1 }
      );
    }

    // Readback depth map from GPU
    const depthMap = await this.readbackDepthMap();

    // Generate point cloud
    const pointCloud = this.pointCloudGenerator.generateFromDepth(
      depthMap,
      width,
      height,
      0.1, // Min depth: 10cm
      10.0, // Max depth: 10m
      1 // Step: every pixel
    );

    // Compute normals for point cloud
    const normals = this.pointCloudGenerator.computeNormals(pointCloud, 10);

    // Create confidence map (placeholder - actual confidence from GPU)
    const confidence = new Float32Array(width * height).fill(1.0);

    const frame: DepthFrame = {
      depthMap,
      pointCloud,
      normals,
      confidence,
      timestamp: performance.now(),
    };

    this.lastDepthFrame = frame;
    return frame;
  }

  /**
   * Convert disparity buffer to depth buffer on GPU
   */
  private async disparityToDepth(
    baseline: number,
    focalLength: number
  ): Promise<void> {
    // For now, do conversion on CPU during readback
    // In production, add GPU shader for this
  }

  /**
   * Readback depth map from GPU to CPU
   */
  private async readbackDepthMap(): Promise<Float32Array> {
    const device = this.gpuContext.getDevice();
    const { width, height } = this.config;
    const pixelCount = width * height;

    // Copy depth buffer to readback buffer
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      this.depthBuffer!,
      0,
      this.readbackBuffer!,
      0,
      pixelCount * 4
    );
    device.queue.submit([commandEncoder.finish()]);

    // Map readback buffer
    await this.readbackBuffer!.mapAsync(GPUMapMode.READ);
    const mappedRange = this.readbackBuffer!.getMappedRange();
    const depthMap = new Float32Array(mappedRange.slice(0, pixelCount * 4));
    this.readbackBuffer!.unmap();

    return depthMap;
  }

  /**
   * Compute depth from monocular image (ML-based)
   * Placeholder for future ML integration (MiDaS, DPT)
   */
  async computeMonocularDepth(image: Uint8Array): Promise<DepthFrame> {
    // TODO: Integrate ML depth estimation model
    // For now, return empty depth frame
    const { width, height } = this.config;
    const pixelCount = width * height;

    return {
      depthMap: new Float32Array(pixelCount),
      pointCloud: new Float32Array(pixelCount * 4),
      confidence: new Float32Array(pixelCount),
      timestamp: performance.now(),
    };
  }

  /**
   * Get last computed depth frame
   */
  getLastDepthFrame(): DepthFrame | null {
    return this.lastDepthFrame;
  }

  /**
   * Update camera intrinsics
   */
  updateIntrinsics(intrinsics: CameraIntrinsics): void {
    this.intrinsics = intrinsics;
    this.pointCloudGenerator.updateIntrinsics(intrinsics);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DepthConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clean up GPU resources
   */
  destroy(): void {
    this.leftImageBuffer?.destroy();
    this.rightImageBuffer?.destroy();
    this.disparityBuffer?.destroy();
    this.depthBuffer?.destroy();
    this.confidenceBuffer?.destroy();
    this.readbackBuffer?.destroy();

    this.leftImageBuffer = null;
    this.rightImageBuffer = null;
    this.disparityBuffer = null;
    this.depthBuffer = null;
    this.confidenceBuffer = null;
    this.readbackBuffer = null;

    console.log('[DepthManager] Destroyed');
  }
}
