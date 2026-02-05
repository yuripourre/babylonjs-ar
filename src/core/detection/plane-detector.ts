/**
 * Plane Detector
 * Detects and tracks planar surfaces using RANSAC
 */

import type { GPUContextManager } from '../gpu/gpu-context';
import { ComputePipeline, calculateWorkgroupCount } from '../gpu/compute-pipeline';
import { Vector3 } from '../math/vector';
import { planeShaders } from '../../shaders/plane-shaders';

export interface PlaneConfig {
  maxPlanes?: number;
  ransacIterations?: number;
  distanceThreshold?: number;
  normalThreshold?: number; // Degrees
  minInliers?: number;
  minPlaneArea?: number;
}

export interface DetectedPlane {
  id: number;
  normal: Vector3;
  distance: number;
  centroid: Vector3;
  inliers: number;
  area: number;
  orientation: 'horizontal' | 'vertical' | 'other';
  confidence: number;
  lastSeen: number;
  boundary?: Vector3[]; // Optional boundary points
}

export class PlaneDetector {
  private gpuContext: GPUContextManager;
  private config: Required<PlaneConfig>;

  // Pipelines
  private normalPipeline: ComputePipeline | null = null;
  private ransacPipeline: ComputePipeline | null = null;
  private refinementPipeline: ComputePipeline | null = null;

  // Textures
  private normalsTexture: GPUTexture | null = null;

  // Buffers
  private pointsBuffer: GPUBuffer | null = null;
  private normalsBuffer: GPUBuffer | null = null;
  private planesBuffer: GPUBuffer | null = null;
  private inlierMaskBuffer: GPUBuffer | null = null;
  private normalParamsBuffer: GPUBuffer | null = null;
  private ransacParamsBuffer: GPUBuffer | null = null;
  private refinementParamsBuffer: GPUBuffer | null = null;

  // Readback
  private planesReadbackBuffer: GPUBuffer | null = null;

  // Tracked planes
  private trackedPlanes: Map<number, DetectedPlane> = new Map();
  private nextPlaneId = 0;

  // Boundary cache for performance
  private boundaryCache: Map<number, {
    boundary: Vector3[];
    planeHash: number;
    timestamp: number;
  }> = new Map();

  constructor(gpuContext: GPUContextManager, config: PlaneConfig = {}) {
    this.gpuContext = gpuContext;
    this.config = {
      maxPlanes: config.maxPlanes ?? 5,
      ransacIterations: config.ransacIterations ?? 256,
      distanceThreshold: config.distanceThreshold ?? 0.05, // 5cm
      normalThreshold: config.normalThreshold ?? 15, // degrees
      minInliers: config.minInliers ?? 100,
      minPlaneArea: config.minPlaneArea ?? 0.1, // 0.1 m²
    };
  }

  /**
   * Initialize plane detector
   */
  async initialize(width: number, height: number): Promise<void> {
    const device = this.gpuContext.getDevice();

    // Create pipelines with actual WGSL shaders
    this.normalPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Normal Estimation',
      shaderCode: planeShaders.normalEstimation,
    });

    this.ransacPipeline = new ComputePipeline(this.gpuContext, {
      label: 'RANSAC Plane Fitting',
      shaderCode: planeShaders.planeFitting,
    });

    this.refinementPipeline = new ComputePipeline(this.gpuContext, {
      label: 'Plane Refinement',
      shaderCode: planeShaders.planeRefinement,
    });

    // Create textures
    this.normalsTexture = device.createTexture({
      label: 'Surface Normals',
      size: { width, height },
      format: 'rgba32float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Create buffers
    const maxPoints = width * height;

    this.pointsBuffer = device.createBuffer({
      label: 'Points',
      size: maxPoints * 16, // vec4<f32>
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.normalsBuffer = device.createBuffer({
      label: 'Normals',
      size: maxPoints * 16, // vec4<f32>
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.planesBuffer = device.createBuffer({
      label: 'Planes',
      size: this.config.ransacIterations * 64, // Plane struct
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.inlierMaskBuffer = device.createBuffer({
      label: 'Inlier Mask',
      size: maxPoints * 4, // u32 per point
      usage: GPUBufferUsage.STORAGE,
    });

    this.normalParamsBuffer = device.createBuffer({
      label: 'Normal Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.ransacParamsBuffer = device.createBuffer({
      label: 'RANSAC Params',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.refinementParamsBuffer = device.createBuffer({
      label: 'Refinement Params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Readback buffer
    this.planesReadbackBuffer = device.createBuffer({
      label: 'Planes Readback',
      size: this.config.ransacIterations * 64,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Initialize parameters
    this.updateNormalParams(width, height);
    this.updateRANSACParams();

    console.log('[PlaneDetector] Initialized');
  }

  /**
   * Update normal estimation parameters
   */
  private updateNormalParams(width: number, height: number): void {
    const data = new Uint32Array(4);
    data[0] = width;
    data[1] = height;
    const floatView = new Float32Array(data.buffer);
    floatView[2] = 1.0; // depth scale
    data[3] = 3; // kernel size
    this.gpuContext.writeBuffer(this.normalParamsBuffer!, 0, data);
  }

  /**
   * Update RANSAC parameters
   */
  private updateRANSACParams(): void {
    const data = new Uint32Array(8);
    data[0] = 0; // Will be set per frame (numPoints)
    data[1] = this.config.ransacIterations;

    const floatView = new Float32Array(data.buffer);
    floatView[2] = this.config.distanceThreshold;
    floatView[3] = Math.cos((this.config.normalThreshold * Math.PI) / 180);

    data[4] = this.config.minInliers;
    data[5] = Math.floor(Math.random() * 0xffffffff); // seed
    floatView[6] = 0.8; // earlyTermThreshold: terminate if 80% inliers found
    floatView[7] = 0.0; // padding

    this.gpuContext.writeBuffer(this.ransacParamsBuffer!, 0, data);
  }

  /**
   * Detect planes from point cloud
   */
  async detectPlanes(
    points: Float32Array,
    normals?: Float32Array
  ): Promise<DetectedPlane[]> {
    if (!this.ransacPipeline) {
      throw new Error('Plane detector not initialized');
    }

    try {
      const device = this.gpuContext.getDevice();
      if (!device) {
        console.error('[PlaneDetector] GPU device not available');
        return [];
      }

      const numPoints = points.length / 4; // vec4 per point

    // Upload point data
    device.queue.writeBuffer(this.pointsBuffer!, 0, points.buffer);

    if (normals) {
      device.queue.writeBuffer(this.normalsBuffer!, 0, normals.buffer);
    }

    // Update RANSAC params with point count
    const ransacData = new Uint32Array(8);
    ransacData[0] = numPoints;
    ransacData[1] = this.config.ransacIterations;
    const floatView = new Float32Array(ransacData.buffer);
    floatView[2] = this.config.distanceThreshold;
    floatView[3] = Math.cos((this.config.normalThreshold * Math.PI) / 180);
    ransacData[4] = this.config.minInliers;
    ransacData[5] = Math.floor(Math.random() * 0xffffffff);
    floatView[6] = 0.8; // earlyTermThreshold: terminate if 80% inliers found
    floatView[7] = 0.0; // padding
    device.queue.writeBuffer(this.ransacParamsBuffer!, 0, ransacData);

    // Run RANSAC
    const ransacBindGroup = this.ransacPipeline.createBindGroup([
      { binding: 0, resource: { buffer: this.pointsBuffer! } },
      { binding: 1, resource: { buffer: this.normalsBuffer! } },
      { binding: 2, resource: { buffer: this.planesBuffer! } },
      { binding: 3, resource: { buffer: this.ransacParamsBuffer! } },
    ]);

    const workgroupCount = Math.ceil(this.config.ransacIterations / 64);

    const encoder = device.createCommandEncoder();
    const ransacPass = encoder.beginComputePass({ label: 'RANSAC' });
    ransacPass.setPipeline(this.ransacPipeline.getPipeline());
    ransacPass.setBindGroup(0, ransacBindGroup);
    ransacPass.dispatchWorkgroups(workgroupCount);
    ransacPass.end();

    // Copy planes to readback
    encoder.copyBufferToBuffer(
      this.planesBuffer!,
      0,
      this.planesReadbackBuffer!,
      0,
      this.config.ransacIterations * 64
    );

    device.queue.submit([encoder.finish()]);

    // Read back planes
    await this.planesReadbackBuffer!.mapAsync(GPUMapMode.READ);
    const planesData = new Float32Array(this.planesReadbackBuffer!.getMappedRange());

    const detectedPlanes = this.extractBestPlanes(planesData);
    this.planesReadbackBuffer!.unmap();

    // Extract boundaries for detected planes (with caching)
    for (const plane of detectedPlanes) {
      plane.boundary = this.getCachedBoundary(plane, points);
    }

    // Update tracking
      this.updateTracking(detectedPlanes);

      return Array.from(this.trackedPlanes.values());

    } catch (error) {
      console.error('[PlaneDetector] GPU detection error:', error);

      // Ensure buffers are unmapped if they were mapped
      try {
        if (this.planesReadbackBuffer) {
          this.planesReadbackBuffer.unmap();
        }
      } catch (unmapError) {
        // Buffer might not be mapped, ignore
      }

      // Return existing tracked planes on error (graceful degradation)
      return Array.from(this.trackedPlanes.values());
    }
  }

  /**
   * Extract best planes from RANSAC results
   */
  private extractBestPlanes(planesData: Float32Array): DetectedPlane[] {
    const planes: DetectedPlane[] = [];
    const planeSize = 16; // floats per plane

    // Parse all candidate planes
    const candidates: Array<{
      normal: Vector3;
      distance: number;
      centroid: Vector3;
      inliers: number;
      score: number;
    }> = [];

    for (let i = 0; i < this.config.ransacIterations; i++) {
      const offset = i * planeSize;
      const score = planesData[offset + 5];

      if (score > 0) {
        candidates.push({
          normal: new Vector3(
            planesData[offset + 0],
            planesData[offset + 1],
            planesData[offset + 2]
          ),
          distance: planesData[offset + 3],
          inliers: planesData[offset + 4],
          score,
          centroid: new Vector3(
            planesData[offset + 6],
            planesData[offset + 7],
            planesData[offset + 8]
          ),
        });
      }
    }

    // Sort by score
    candidates.sort((a, b) => b.score - a.score);

    // Select top planes that are distinct
    for (const candidate of candidates) {
      if (planes.length >= this.config.maxPlanes) {
        break;
      }

      // Check if similar to existing plane
      let isDuplicate = false;
      for (const plane of planes) {
        const normalSimilarity = Math.abs(candidate.normal.dot(plane.normal));
        const distanceDiff = Math.abs(candidate.distance - plane.distance);

        if (normalSimilarity > 0.95 && distanceDiff < 0.1) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        const orientation = this.classifyOrientation(candidate.normal);

        planes.push({
          id: -1, // Will be assigned during tracking
          normal: candidate.normal,
          distance: candidate.distance,
          centroid: candidate.centroid,
          inliers: candidate.inliers,
          area: candidate.inliers * 0.01, // Rough estimate
          orientation,
          confidence: Math.min(1.0, candidate.score / 1000),
          lastSeen: performance.now(),
        });
      }
    }

    return planes;
  }

  /**
   * Hash plane parameters for caching
   */
  private hashPlane(plane: DetectedPlane): number {
    // Hash based on normal and distance (quantized to 1cm)
    const nx = Math.round(plane.normal.x * 100);
    const ny = Math.round(plane.normal.y * 100);
    const nz = Math.round(plane.normal.z * 100);
    const d = Math.round(plane.distance * 100);

    // Simple hash combining all components
    return ((nx * 73856093) ^ (ny * 19349663) ^ (nz * 83492791) ^ (d * 50331653)) >>> 0;
  }

  /**
   * Get cached boundary or compute new one
   */
  private getCachedBoundary(plane: DetectedPlane, points: Float32Array): Vector3[] {
    const hash = this.hashPlane(plane);
    const cached = this.boundaryCache.get(plane.id);
    const now = performance.now();

    // Check if cache is valid
    if (cached && cached.planeHash === hash && now - cached.timestamp < 1000) {
      return cached.boundary; // Use cached boundary
    }

    // Compute new boundary
    const boundary = this.extractBoundary(plane, points);

    // Update cache
    this.boundaryCache.set(plane.id, {
      boundary,
      planeHash: hash,
      timestamp: now,
    });

    return boundary;
  }

  /**
   * Extract plane boundary from inlier points
   */
  private extractBoundary(
    plane: DetectedPlane,
    points: Float32Array
  ): Vector3[] {
    // Project inliers onto plane and extract 2D convex hull
    const inliers: Vector3[] = [];
    const numPoints = points.length / 4;

    // Find inlier points
    for (let i = 0; i < numPoints; i++) {
      const point = new Vector3(
        points[i * 4],
        points[i * 4 + 1],
        points[i * 4 + 2]
      );

      const distance = Math.abs(
        plane.normal.dot(point) + plane.distance
      );

      if (distance < this.config.distanceThreshold) {
        inliers.push(point);
      }
    }

    if (inliers.length < 4) {
      return [];
    }

    // Create 2D coordinate system on plane
    const normal = plane.normal;
    let u: Vector3;

    // Choose u perpendicular to normal
    if (Math.abs(normal.x) < 0.9) {
      u = new Vector3(1, 0, 0).cross(normal).normalize();
    } else {
      u = new Vector3(0, 1, 0).cross(normal).normalize();
    }
    const v = normal.cross(u);

    // Project points to 2D
    const points2D: Array<{ x: number; y: number; point3D: Vector3 }> = [];
    for (const point of inliers) {
      const relative = point.subtract(plane.centroid);
      points2D.push({
        x: relative.dot(u),
        y: relative.dot(v),
        point3D: point,
      });
    }

    // Compute 2D convex hull using Graham scan
    const hull2D = this.convexHull2D(points2D);

    // Convert back to 3D
    return hull2D.map((p) => p.point3D);
  }

  /**
   * Compute 2D convex hull using Graham scan
   */
  private convexHull2D(
    points: Array<{ x: number; y: number; point3D: Vector3 }>
  ): Array<{ x: number; y: number; point3D: Vector3 }> {
    if (points.length < 3) {
      return points;
    }

    // Find bottom-most point (lowest y, then lowest x)
    let start = points[0];
    for (const p of points) {
      if (p.y < start.y || (p.y === start.y && p.x < start.x)) {
        start = p;
      }
    }

    // Sort by polar angle
    const sorted = points
      .filter((p) => p !== start)
      .sort((a, b) => {
        const angleA = Math.atan2(a.y - start.y, a.x - start.x);
        const angleB = Math.atan2(b.y - start.y, b.x - start.x);
        return angleA - angleB;
      });

    // Graham scan
    const hull = [start, sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      while (hull.length >= 2) {
        const p1 = hull[hull.length - 2];
        const p2 = hull[hull.length - 1];
        const p3 = sorted[i];

        // Cross product to check turn direction
        const cross =
          (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);

        if (cross > 0) {
          break; // Left turn
        }
        hull.pop(); // Right turn, remove p2
      }
      hull.push(sorted[i]);
    }

    // Simplify hull (Douglas-Peucker-like decimation)
    return this.simplifyPolygon(hull, 0.1); // 10cm tolerance
  }

  /**
   * Simplify polygon by removing points close to edges
   */
  private simplifyPolygon(
    polygon: Array<{ x: number; y: number; point3D: Vector3 }>,
    tolerance: number
  ): Array<{ x: number; y: number; point3D: Vector3 }> {
    if (polygon.length <= 4) {
      return polygon;
    }

    const simplified = [polygon[0]];

    for (let i = 1; i < polygon.length - 1; i++) {
      const prev = simplified[simplified.length - 1];
      const curr = polygon[i];
      const next = polygon[i + 1];

      // Check if current point is far from line prev->next
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0.001) {
        const dist =
          Math.abs((dy * curr.x - dx * curr.y + next.x * prev.y - next.y * prev.x)) /
          len;

        if (dist > tolerance) {
          simplified.push(curr);
        }
      }
    }

    simplified.push(polygon[polygon.length - 1]);
    return simplified;
  }

  /**
   * Classify plane orientation
   */
  private classifyOrientation(normal: Vector3): 'horizontal' | 'vertical' | 'other' {
    const absY = Math.abs(normal.y);

    if (absY > 0.9) {
      return 'horizontal';
    } else if (absY < 0.3) {
      return 'vertical';
    } else {
      return 'other';
    }
  }

  /**
   * Update plane tracking
   */
  private updateTracking(detectedPlanes: DetectedPlane[]): void {
    const now = performance.now();

    // Match detected planes with tracked planes
    for (const detected of detectedPlanes) {
      let matched = false;

      for (const [id, tracked] of this.trackedPlanes) {
        const normalSimilarity = Math.abs(detected.normal.dot(tracked.normal));
        const distanceDiff = Math.abs(detected.distance - tracked.distance);

        if (normalSimilarity > 0.9 && distanceDiff < 0.15) {
          // Update existing plane
          tracked.normal = detected.normal;
          tracked.distance = detected.distance;
          tracked.centroid = detected.centroid;
          tracked.inliers = detected.inliers;
          tracked.area = detected.area;
          tracked.confidence = Math.min(
            1.0,
            tracked.confidence * 0.7 + detected.confidence * 0.3
          );
          tracked.lastSeen = now;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // New plane
        detected.id = this.nextPlaneId++;
        this.trackedPlanes.set(detected.id, detected);
        console.log(`[PlaneDetector] New plane ${detected.id} (${detected.orientation})`);
      }
    }

    // Remove lost planes
    const timeout = 2000; // 2 seconds
    for (const [id, plane] of this.trackedPlanes) {
      if (now - plane.lastSeen > timeout) {
        this.trackedPlanes.delete(id);
        console.log(`[PlaneDetector] Lost plane ${id}`);
      }
    }
  }

  /**
   * Get tracked planes
   */
  getTrackedPlanes(): DetectedPlane[] {
    return Array.from(this.trackedPlanes.values());
  }

  /**
   * Get specific plane by ID
   */
  getPlane(id: number): DetectedPlane | null {
    return this.trackedPlanes.get(id) ?? null;
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.trackedPlanes.clear();
    this.boundaryCache.clear();
    this.nextPlaneId = 0;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.normalsTexture?.destroy();
    this.pointsBuffer?.destroy();
    this.normalsBuffer?.destroy();
    this.planesBuffer?.destroy();
    this.inlierMaskBuffer?.destroy();
    this.normalParamsBuffer?.destroy();
    this.ransacParamsBuffer?.destroy();
    this.refinementParamsBuffer?.destroy();
    this.planesReadbackBuffer?.destroy();
    this.trackedPlanes.clear();
  }
}
