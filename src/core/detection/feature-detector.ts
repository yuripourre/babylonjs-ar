/**
 * Feature Detector
 * Detects and describes keypoints using FAST + ORB
 */

import type { GPUContextManager } from '../gpu/gpu-context';
import { ComputePipeline, calculateWorkgroupCount } from '../gpu/compute-pipeline';
import { getORBPattern, patternToArray } from './orb-pattern';
import { featureShaders } from '../../shaders/feature-shaders';

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
    const device = this.gpuContext.device;

    // Create pipelines with actual WGSL shaders
    this.fastPipeline = new ComputePipeline(this.gpuContext, {
      label: 'FAST Corners',
      shaderCode: featureShaders.fastCorners,
    });

    this.orientationPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Orientation',
      shaderCode: featureShaders.orientation,
    });

    this.orbPipeline = new ComputePipeline(this.gpuContext, {
      label: 'ORB Descriptor',
      shaderCode: featureShaders.orbDescriptor,
    });

    this.matchingPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Feature Matching',
      shaderCode: featureShaders.featureMatching,
    });

    // Create textures
    this.cornersTexture = device.createTexture({
      label: 'FAST Corners',
      size: { width, height },
      format: 'r32float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    // Create ORB pattern buffer
    const orbPattern = getORBPattern();
    const patternArray = patternToArray(orbPattern);
    this.patternBuffer = device.createBuffer({
      label: 'ORB Pattern',
      size: patternArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.patternBuffer, 0, patternArray.buffer);

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
   * Update FAST parameters
   */
  private updateFASTParams(): void {
    const data = new Float32Array([
      this.config.fastThreshold / 255.0,
      this.config.nonMaxSuppression ? 1.0 : 0.0,
      0.0,
      0.0,
    ]);
    this.gpuContext.device.queue.writeBuffer(this.fastParamsBuffer!, 0, data);
  }

  /**
   * Update ORB parameters
   */
  private updateORBParams(): void {
    const data = new Uint32Array(4);
    data[0] = this.currentKeypoints.length;
    data[1] = 31; // Patch size
    this.gpuContext.device.queue.writeBuffer(this.orbParamsBuffer!, 0, data);
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
    this.gpuContext.device.queue.writeBuffer(this.matchingParamsBuffer!, 0, data);
  }

  /**
   * Detect keypoints in image
   */
  async detectKeypoints(grayscaleTexture: GPUTexture): Promise<Keypoint[]> {
    if (!this.fastPipeline) {
      throw new Error('Detector not initialized');
    }

    try {
      const device = this.gpuContext.device;
      if (!device) {
        console.error('[FeatureDetector] GPU device not available');
        this.currentKeypoints = [];
        return [];
      }

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

    } catch (error) {
      console.error('[FeatureDetector] GPU detection error:', error);

      // Ensure buffer is unmapped if it was mapped
      try {
        if (this.cornersReadbackBuffer) {
          this.cornersReadbackBuffer.unmap();
        }
      } catch (unmapError) {
        // Buffer might not be mapped, ignore
      }

      // Return empty array on error
      this.currentKeypoints = [];
      return [];
    }
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
              if (dx === 0 && dy === 0) {continue;}

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
    if (!this.orbPipeline || keypoints.length === 0) {
      const descriptors = new Uint32Array(0);
      this.currentDescriptors = descriptors;
      return descriptors;
    }

    const device = this.gpuContext.device;

    // Upload keypoints to GPU
    const keypointsData = new Float32Array(keypoints.length * 4);
    for (let i = 0; i < keypoints.length; i++) {
      keypointsData[i * 4 + 0] = keypoints[i].x;
      keypointsData[i * 4 + 1] = keypoints[i].y;
      keypointsData[i * 4 + 2] = keypoints[i].angle;
      keypointsData[i * 4 + 3] = keypoints[i].response;
    }
    device.queue.writeBuffer(this.keypointsBuffer!, 0, keypointsData.buffer);

    // Update parameters
    this.updateORBParams();

    // Create bind group for ORB
    const orbBindGroup = this.orbPipeline.createBindGroup([
      { binding: 0, resource: grayscaleTexture.createView() },
      { binding: 1, resource: { buffer: this.keypointsBuffer! } },
      { binding: 2, resource: { buffer: this.descriptorsBuffer! } },
      { binding: 3, resource: { buffer: this.patternBuffer! } },
      { binding: 4, resource: { buffer: this.orbParamsBuffer! } },
    ]);

    // Dispatch ORB computation
    const workgroups = Math.ceil(keypoints.length / 64);
    this.orbPipeline.executeAndSubmit(orbBindGroup, { x: workgroups, y: 1, z: 1 });

    // Read back descriptors
    const descriptorsReadback = device.createBuffer({
      size: keypoints.length * 32, // 8 u32s per descriptor
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      this.descriptorsBuffer!,
      0,
      descriptorsReadback,
      0,
      keypoints.length * 32
    );
    device.queue.submit([encoder.finish()]);

    await descriptorsReadback.mapAsync(GPUMapMode.READ);
    const descriptors = new Uint32Array(descriptorsReadback.getMappedRange()).slice();
    descriptorsReadback.unmap();
    descriptorsReadback.destroy();

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
    if (!this.matchingPipeline || descriptors1.length === 0 || descriptors2.length === 0) {
      return [];
    }

    const device = this.gpuContext.device;
    const numDesc1 = descriptors1.length / 8;
    const numDesc2 = descriptors2.length / 8;

    // Create descriptor buffers
    const desc1Buffer = device.createBuffer({
      size: descriptors1.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const desc2Buffer = device.createBuffer({
      size: descriptors2.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(desc1Buffer, 0, descriptors1.buffer);
    device.queue.writeBuffer(desc2Buffer, 0, descriptors2.buffer);

    // Update matching parameters
    const matchingData = new Uint32Array(4);
    matchingData[0] = numDesc1;
    matchingData[1] = numDesc2;
    matchingData[2] = this.config.matchingMaxDistance;
    const floatView = new Float32Array(matchingData.buffer);
    floatView[3] = this.config.matchingRatioThreshold;
    device.queue.writeBuffer(this.matchingParamsBuffer!, 0, matchingData.buffer);

    // Create bind group for matching
    const matchingBindGroup = this.matchingPipeline.createBindGroup([
      { binding: 0, resource: { buffer: desc1Buffer } },
      { binding: 1, resource: { buffer: desc2Buffer } },
      { binding: 2, resource: { buffer: this.matchesBuffer! } },
      { binding: 3, resource: { buffer: this.matchingParamsBuffer! } },
    ]);

    // Dispatch matching
    const workgroups = Math.ceil(numDesc1 / 64);
    this.matchingPipeline.executeAndSubmit(matchingBindGroup, { x: workgroups, y: 1, z: 1 });

    // Read back matches
    const matchesReadback = device.createBuffer({
      size: numDesc1 * 8, // vec2<i32> per query descriptor
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      this.matchesBuffer!,
      0,
      matchesReadback,
      0,
      numDesc1 * 8
    );
    device.queue.submit([encoder.finish()]);

    await matchesReadback.mapAsync(GPUMapMode.READ);
    const matchesData = new Int32Array(matchesReadback.getMappedRange());

    const matches: FeatureMatch[] = [];
    for (let i = 0; i < numDesc1; i++) {
      const trainIdx = matchesData[i * 2];
      const distance = matchesData[i * 2 + 1];

      if (trainIdx >= 0 && distance < this.config.matchingMaxDistance) {
        matches.push({
          queryIdx: i,
          trainIdx,
          distance,
        });
      }
    }

    matchesReadback.unmap();
    matchesReadback.destroy();
    desc1Buffer.destroy();
    desc2Buffer.destroy();

    console.log(`[FeatureDetector] Found ${matches.length} matches`);
    return matches;
  }

  /**
   * Get current keypoints
   */
  getCurrentKeypoints(): Keypoint[] {
    return this.currentKeypoints;
  }

  /**
   * Detect keypoints and compute descriptors (SLAM compatible)
   */
  async detectAndCompute(grayscaleTexture: GPUTexture): Promise<void> {
    // 1. Detect keypoints
    await this.detectKeypoints(grayscaleTexture);

    if (this.currentKeypoints.length === 0) {
      this.currentDescriptors = new Uint32Array(0);
      return;
    }

    // 2. Compute ORB descriptors (fixed: was TODO, now properly calls implementation)
    this.currentDescriptors = await this.computeDescriptors(
      grayscaleTexture,
      this.currentKeypoints
    );

    console.log(
      `[FeatureDetector] Detected ${this.currentKeypoints.length} keypoints, ` +
      `computed ${this.currentDescriptors ? this.currentDescriptors.length / 8 : 0} descriptors`
    );
  }

  /**
   * Get detected keypoints (SLAM compatible)
   */
  getKeypoints(): Keypoint[] {
    return this.currentKeypoints;
  }

  /**
   * Get computed descriptors (SLAM compatible)
   */
  getDescriptors(): Uint32Array | null {
    return this.currentDescriptors;
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
