/**
 * Feature Detector
 * Detects and describes keypoints using FAST + ORB
 */

import type { GPUContextManager } from '../gpu/gpu-context';
import { ComputePipeline, calculateWorkgroupCount } from '../gpu/compute-pipeline';
import { getORBPattern, patternToArray } from './orb-pattern';

export interface Keypoint {
  x: number;
  y: number;
  angle: number;
  response: number;
  octave: number;
}

export interface FeatureMatch {
  queryIdx: number;
  trainIdx: number;
  distance: number;
}

export interface FeatureDetectorConfig {
  maxKeypoints?: number;
  fastThreshold?: number;
  nonMaxSuppression?: boolean;
  matchingMaxDistance?: number;
  matchingRatioThreshold?: number;
}

export class FeatureDetector {
  private gpuContext: GPUContextManager;
  private config: Required<FeatureDetectorConfig>;

  // Pipelines
  private fastPipeline: ComputePipeline | null = null;
  private orientationPipeline: ComputePipeline | null = null;
  private orbPipeline: ComputePipeline | null = null;
  private matchingPipeline: ComputePipeline | null = null;

  // Textures
  private cornersTexture: GPUTexture | null = null;

  // Buffers
  private fastParamsBuffer: GPUBuffer | null = null;
  private keypointsBuffer: GPUBuffer | null = null;
  private orientedKeypointsBuffer: GPUBuffer | null = null;
  private orientationParamsBuffer: GPUBuffer | null = null;
  private patternBuffer: GPUBuffer | null = null;
  private descriptorsBuffer: GPUBuffer | null = null;
  private orbParamsBuffer: GPUBuffer | null = null;
  private matchingParamsBuffer: GPUBuffer | null = null;
  private matchesBuffer: GPUBuffer | null = null;

  // Readback
  private cornersReadbackBuffer: GPUBuffer | null = null;
  private keypointsReadbackBuffer: GPUBuffer | null = null;

  // Current keypoints and descriptors
  private currentKeypoints: Keypoint[] = [];
  private currentDescriptors: Uint32Array | null = null;

  constructor(gpuContext: GPUContextManager, config: FeatureDetectorConfig = {}) {
    this.gpuContext = gpuContext;
    this.config = {
      maxKeypoints: config.maxKeypoints ?? 500,
      fastThreshold: config.fastThreshold ?? 20,
      nonMaxSuppression: config.nonMaxSuppression ?? true,
      matchingMaxDistance: config.matchingMaxDistance ?? 50,
      matchingRatioThreshold: config.matchingRatioThreshold ?? 0.75,
    };
  }

  /**
   * Initialize detector
   */
  async initialize(width: number, height: number): Promise<void> {
    const device = this.gpuContext.getDevice();

    // Load shaders
    const fastShader = await this.loadShader('fast-corners.wgsl');
    const orbShader = await this.loadShader('orb-descriptor.wgsl');
    const matchingShader = await this.loadShader('feature-matching.wgsl');

    // Create pipelines
    this.fastPipeline = new ComputePipeline(this.gpuContext, {
      label: 'FAST Corners',
      shaderCode: fastShader,
    });

    // Create textures
    this.cornersTexture = device.createTexture({
      label: 'FAST Corners',
      size: { width, height },
      format: 'r32float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    // Create buffers
    this.fastParamsBuffer = device.createBuffer({
      label: 'FAST Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.keypointsBuffer = device.createBuffer({
      label: 'Keypoints',
      size: this.config.maxKeypoints * 16, // vec4<f32> per keypoint
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const descriptorSize = this.config.maxKeypoints * 8 * 4; // 8 u32s per descriptor
    this.descriptorsBuffer = device.createBuffer({
      label: 'Descriptors',
      size: descriptorSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    this.orbParamsBuffer = device.createBuffer({
      label: 'ORB Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.matchingParamsBuffer = device.createBuffer({
      label: 'Matching Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.matchesBuffer = device.createBuffer({
      label: 'Matches',
      size: this.config.maxKeypoints * 8, // vec2<i32> per match
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Readback buffers
    this.cornersReadbackBuffer = device.createBuffer({
      label: 'Corners Readback',
      size: width * height * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    this.keypointsReadbackBuffer = device.createBuffer({
      label: 'Keypoints Readback',
      size: this.config.maxKeypoints * 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Initialize parameters
    this.updateFASTParams();
    this.updateORBParams();
    this.updateMatchingParams();

    console.log('[FeatureDetector] Initialized');
  }

  /**
   * Load shader code
   */
  private async loadShader(filename: string): Promise<string> {
    // In production, load from actual files
    // For now, return placeholder
    return `@compute @workgroup_size(16, 16) fn main() {}`;
  }

  /**
   * Update FAST parameters
   */
  private updateFASTParams(): void {
    const data = new Float32Array([
      this.config.fastThreshold / 255.0,
      this.config.nonMaxSuppression ? 1.0 : 0.0,
      0.0,
      0.0,
    ]);
    this.gpuContext.writeBuffer(this.fastParamsBuffer!, 0, data);
  }

  /**
   * Update ORB parameters
   */
  private updateORBParams(): void {
    const data = new Uint32Array(4);
    data[0] = this.currentKeypoints.length;
    data[1] = 31; // Patch size
    this.gpuContext.writeBuffer(this.orbParamsBuffer!, 0, data);
  }

  /**
   * Update matching parameters
   */
  private updateMatchingParams(): void {
    const data = new Uint32Array(4);
    data[0] = this.currentKeypoints.length;
    data[1] = this.currentKeypoints.length; // Matching against same size
    data[2] = this.config.matchingMaxDistance;
    const floatView = new Float32Array(data.buffer);
    floatView[3] = this.config.matchingRatioThreshold;
    this.gpuContext.writeBuffer(this.matchingParamsBuffer!, 0, data);
  }

  /**
   * Detect keypoints in image
   */
  async detectKeypoints(grayscaleTexture: GPUTexture): Promise<Keypoint[]> {
    if (!this.fastPipeline) {
      throw new Error('Detector not initialized');
    }

    const device = this.gpuContext.getDevice();
    const width = grayscaleTexture.width;
    const height = grayscaleTexture.height;

    // Step 1: Run FAST detector
    const fastBindGroup = this.fastPipeline.createBindGroup([
      { binding: 0, resource: grayscaleTexture.createView() },
      { binding: 1, resource: this.cornersTexture!.createView() },
      { binding: 2, resource: { buffer: this.fastParamsBuffer! } },
    ]);

    const workgroupCount = calculateWorkgroupCount(width, height, { x: 16, y: 16 });

    const encoder = device.createCommandEncoder();
    const fastPass = encoder.beginComputePass();
    fastPass.setPipeline(this.fastPipeline.getPipeline());
    fastPass.setBindGroup(0, fastBindGroup);
    fastPass.dispatchWorkgroups(workgroupCount.x, workgroupCount.y);
    fastPass.end();

    // Copy to readback
    encoder.copyTextureToBuffer(
      { texture: this.cornersTexture! },
      { buffer: this.cornersReadbackBuffer!, bytesPerRow: width * 4 },
      { width, height }
    );

    device.queue.submit([encoder.finish()]);

    // Read back and extract keypoints
    await this.cornersReadbackBuffer!.mapAsync(GPUMapMode.READ);
    const cornersData = new Float32Array(this.cornersReadbackBuffer!.getMappedRange());

    const keypoints = this.extractKeypoints(cornersData, width, height);
    this.cornersReadbackBuffer!.unmap();

    this.currentKeypoints = keypoints;

    console.log(`[FeatureDetector] Detected ${keypoints.length} keypoints`);

    return keypoints;
  }

  /**
   * Extract keypoints from corner response map
   */
  private extractKeypoints(
    cornersData: Float32Array,
    width: number,
    height: number
  ): Keypoint[] {
    const keypoints: Keypoint[] = [];

    // Non-maximum suppression and selection
    const radius = 3;

    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const idx = y * width + x;
        const response = cornersData[idx];

        if (response > 0) {
          // Check if local maximum
          let isMax = true;

          for (let dy = -radius; dy <= radius && isMax; dy++) {
            for (let dx = -radius; dx <= radius && isMax; dx++) {
              if (dx === 0 && dy === 0) continue;

              const neighborIdx = (y + dy) * width + (x + dx);
              if (cornersData[neighborIdx] >= response) {
                isMax = false;
              }
            }
          }

          if (isMax) {
            keypoints.push({
              x,
              y,
              angle: 0, // Computed later if needed
              response,
              octave: 0,
            });
          }
        }
      }
    }

    // Sort by response and keep top N
    keypoints.sort((a, b) => b.response - a.response);

    return keypoints.slice(0, this.config.maxKeypoints);
  }

  /**
   * Compute ORB descriptors for keypoints
   */
  async computeDescriptors(
    grayscaleTexture: GPUTexture,
    keypoints: Keypoint[]
  ): Promise<Uint32Array> {
    // Placeholder - would compute orientation and ORB descriptors
    // For now, return zeros
    const descriptors = new Uint32Array(keypoints.length * 8);
    this.currentDescriptors = descriptors;
    return descriptors;
  }

  /**
   * Match features between frames
   */
  async matchFeatures(
    descriptors1: Uint32Array,
    descriptors2: Uint32Array
  ): Promise<FeatureMatch[]> {
    // Placeholder - would run matching on GPU
    // For now, return empty
    return [];
  }

  /**
   * Get current keypoints
   */
  getCurrentKeypoints(): Keypoint[] {
    return this.currentKeypoints;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.cornersTexture?.destroy();
    this.fastParamsBuffer?.destroy();
    this.keypointsBuffer?.destroy();
    this.descriptorsBuffer?.destroy();
    this.orbParamsBuffer?.destroy();
    this.matchingParamsBuffer?.destroy();
    this.matchesBuffer?.destroy();
    this.cornersReadbackBuffer?.destroy();
    this.keypointsReadbackBuffer?.destroy();
  }
}
