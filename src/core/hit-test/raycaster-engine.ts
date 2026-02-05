/**
 * Raycaster Engine
 * Unified hit testing API with XR native and CPU fallback
 *
 * Features:
 * - Screen-space to 3D ray conversion
 * - Ray-plane intersection
 * - Ray-point-cloud intersection
 * - XR hit test integration
 * - Automatic method selection
 */

import { Ray } from './ray';
import { Vector3 } from '../math/vector';
import { Matrix4 } from '../math/matrix';
import { Quaternion } from '../math/quaternion';
import type { XRSessionManager } from '../xr/xr-session-manager';
import type { DetectedPlane } from '../detection/plane-detector';
import type { Point3D } from '../detection/point-cloud';
import { Logger } from '../../utils/logger';

const log = Logger.create('RaycasterEngine');

export interface HitTestOptions {
  screenPosition?: { x: number; y: number };
  ray?: Ray;
  maxDistance?: number;
  planes?: DetectedPlane[];
  pointCloud?: Point3D[];
  useXR?: boolean; // Prefer XR hit test if available
}

export interface HitTestResult {
  hitPoint: Vector3;
  normal: Vector3;
  distance: number;
  hitType: 'plane' | 'point-cloud' | 'mesh' | 'xr-hit-test';
  transform: Matrix4;
  confidence: number;
  plane?: DetectedPlane; // If hit a plane
}

export class RaycasterEngine {
  private xrSession: XRSessionManager | null = null;
  private xrHitTestSource: XRHitTestSource | null = null;

  constructor(xrSession?: XRSessionManager) {
    this.xrSession = xrSession ?? null;
  }

  /**
   * Set XR session for native hit testing
   */
  setXRSession(session: XRSessionManager): void {
    this.xrSession = session;
  }

  /**
   * Perform hit test with automatic method selection
   */
  async performHitTest(
    options: HitTestOptions,
    frame?: XRFrame,
    viewMatrix?: Matrix4,
    projectionMatrix?: Matrix4,
    screenWidth?: number,
    screenHeight?: number
  ): Promise<HitTestResult[]> {
    // Try XR hit test first if available and preferred
    if (options.useXR !== false && this.xrSession && frame) {
      const xrResults = await this.performXRHitTest(options, frame);
      if (xrResults.length > 0) {
        return xrResults;
      }
    }

    // Fall back to CPU raycasting
    return this.performCPUHitTest(
      options,
      viewMatrix,
      projectionMatrix,
      screenWidth,
      screenHeight
    );
  }

  /**
   * Perform XR native hit test
   */
  private async performXRHitTest(
    options: HitTestOptions,
    frame: XRFrame
  ): Promise<HitTestResult[]> {
    if (!this.xrSession) {
      return [];
    }

    try {
      // Create transient hit test source if we have screen position
      if (options.screenPosition) {
        const session = this.xrSession.getSession();
        if (!session) {
          return [];
        }

        // For now, use the existing hit test source if available
        if (this.xrHitTestSource) {
          const results = this.xrSession.getHitTestResults(
            this.xrHitTestSource,
            frame
          );

          return results.map(result => this.convertXRHitTestResult(result, frame));
        }
      }

      return [];
    } catch (error) {
      log.error('XR hit test failed', error);
      return [];
    }
  }

  /**
   * Convert XR hit test result to our format
   */
  private convertXRHitTestResult(
    result: XRHitTestResult,
    frame: XRFrame
  ): HitTestResult {
    const referenceSpace = this.xrSession!.getReferenceSpace()!;
    const pose = result.getPose(referenceSpace);

    if (!pose) {
      throw new Error('Failed to get pose from hit test result');
    }

    const transform = pose.transform;
    const position = new Vector3(
      transform.position.x,
      transform.position.y,
      transform.position.z
    );

    // Extract normal from orientation (up vector)
    const orientation = transform.orientation;
    const quat = new Quaternion(
      orientation.x,
      orientation.y,
      orientation.z,
      orientation.w
    );
    const rotMatrix = new Matrix4(quat.toMatrix());
    const normal = rotMatrix.transformPoint(new Vector3(0, 1, 0)).normalize();

    // Build transformation matrix
    const matrix = Matrix4.compose(
      position,
      quat,
      new Vector3(1, 1, 1)
    );

    return {
      hitPoint: position,
      normal,
      distance: position.length(),
      hitType: 'xr-hit-test',
      transform: matrix,
      confidence: 1.0, // XR hit tests are high confidence
    };
  }

  /**
   * Perform CPU-based hit test
   */
  private performCPUHitTest(
    options: HitTestOptions,
    viewMatrix?: Matrix4,
    projectionMatrix?: Matrix4,
    screenWidth?: number,
    screenHeight?: number
  ): HitTestResult[] {
    // Get or create ray
    let ray: Ray;
    if (options.ray) {
      ray = options.ray;
    } else if (
      options.screenPosition &&
      viewMatrix &&
      projectionMatrix &&
      screenWidth &&
      screenHeight
    ) {
      ray = Ray.fromScreen(
        options.screenPosition.x,
        options.screenPosition.y,
        screenWidth,
        screenHeight,
        viewMatrix,
        projectionMatrix
      );
    } else {
      log.error('Insufficient parameters for CPU hit test');
      return [];
    }

    const results: HitTestResult[] = [];
    const maxDistance = options.maxDistance ?? 100;

    // Test against planes
    if (options.planes) {
      for (const plane of options.planes) {
        const result = this.rayPlaneIntersection(ray, plane, maxDistance);
        if (result) {
          results.push(result);
        }
      }
    }

    // Test against point cloud
    if (options.pointCloud) {
      const result = this.rayPointCloudIntersection(
        ray,
        options.pointCloud,
        maxDistance
      );
      if (result) {
        results.push(result);
      }
    }

    // Sort by distance
    results.sort((a, b) => a.distance - b.distance);

    return results;
  }

  /**
   * Ray-plane intersection test
   */
  rayPlaneIntersection(
    ray: Ray,
    plane: DetectedPlane,
    maxDistance: number = 100
  ): HitTestResult | null {
    const planeNormal = plane.normal;
    const planeCenter = plane.centroid;

    // Check if ray is parallel to plane
    const denom = ray.direction.dot(planeNormal);
    if (Math.abs(denom) < 0.0001) {
      return null; // Parallel
    }

    // Calculate intersection distance
    const t = planeCenter.subtract(ray.origin).dot(planeNormal) / denom;

    // Check if intersection is behind ray origin or too far
    if (t < 0 || t > maxDistance) {
      return null;
    }

    // Get hit point
    const hitPoint = ray.getPoint(t);

    // Check if hit point is within plane bounds
    if (plane.boundary) {
      if (!this.isPointInPolygon(hitPoint, plane.boundary, planeNormal)) {
        return null;
      }
    }

    // Build transformation matrix at hit point
    const transform = this.buildPlaneTransform(hitPoint, planeNormal);

    return {
      hitPoint,
      normal: planeNormal,
      distance: t,
      hitType: 'plane',
      transform,
      confidence: plane.confidence ?? 0.8,
      plane,
    };
  }

  /**
   * Ray-point-cloud intersection test
   * Finds closest point in cloud within threshold
   */
  rayPointCloudIntersection(
    ray: Ray,
    pointCloud: Point3D[],
    maxDistance: number = 100,
    threshold: number = 0.05 // 5cm threshold
  ): HitTestResult | null {
    let closestPoint: Point3D | null = null;
    let closestDistance = Infinity;
    let rayT = Infinity;

    for (const point of pointCloud) {
      const pointVec = point.position;

      // Project point onto ray
      const toPoint = pointVec.subtract(ray.origin);
      const t = toPoint.dot(ray.direction);

      // Skip if behind ray or too far
      if (t < 0 || t > maxDistance) {
        continue;
      }

      // Get closest point on ray
      const rayPoint = ray.getPoint(t);
      const distance = rayPoint.subtract(pointVec).length();

      // Check if within threshold and closer than previous
      if (distance < threshold && distance < closestDistance) {
        closestPoint = point;
        closestDistance = distance;
        rayT = t;
      }
    }

    if (!closestPoint) {
      return null;
    }

    const hitPoint = closestPoint.position;

    // Estimate normal from nearby points
    const normal = this.estimateNormalFromPointCloud(
      hitPoint,
      pointCloud,
      0.1 // 10cm radius
    );

    // Build transformation matrix
    const transform = this.buildPlaneTransform(hitPoint, normal);

    return {
      hitPoint,
      normal,
      distance: rayT,
      hitType: 'point-cloud',
      transform,
      confidence: 0.6, // Lower confidence for point cloud hits
    };
  }

  /**
   * Check if point is inside polygon (2D test in plane space)
   */
  private isPointInPolygon(
    point: Vector3,
    boundary: Vector3[],
    normal: Vector3
  ): boolean {
    if (boundary.length < 3) {
      return false;
    }

    // Create coordinate system in plane
    const xAxis = boundary[1].subtract(boundary[0]).normalize();
    const yAxis = normal.cross(xAxis).normalize();

    // Project point and boundary to 2D
    const point2D = {
      x: point.subtract(boundary[0]).dot(xAxis),
      y: point.subtract(boundary[0]).dot(yAxis),
    };

    const boundary2D = boundary.map(v => ({
      x: v.subtract(boundary[0]).dot(xAxis),
      y: v.subtract(boundary[0]).dot(yAxis),
    }));

    // Ray casting algorithm
    let inside = false;
    for (let i = 0, j = boundary2D.length - 1; i < boundary2D.length; j = i++) {
      const xi = boundary2D[i].x,
        yi = boundary2D[i].y;
      const xj = boundary2D[j].x,
        yj = boundary2D[j].y;

      const intersect =
        yi > point2D.y !== yj > point2D.y &&
        point2D.x < ((xj - xi) * (point2D.y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Estimate normal from nearby points in point cloud
   */
  private estimateNormalFromPointCloud(
    point: Vector3,
    pointCloud: Point3D[],
    radius: number
  ): Vector3 {
    // Find nearby points
    const nearbyPoints: Vector3[] = [];
    for (const p of pointCloud) {
      const pVec = p.position;
      const distance = pVec.subtract(point).length();
      if (distance < radius) {
        nearbyPoints.push(pVec);
      }
    }

    if (nearbyPoints.length < 3) {
      // Not enough points, return up vector
      return new Vector3(0, 1, 0);
    }

    // Compute covariance matrix
    const centroid = nearbyPoints
      .reduce((sum, p) => sum.add(p), new Vector3(0, 0, 0))
      .multiply(1 / nearbyPoints.length);

    // Simplified normal estimation: use cross product of two vectors
    const v1 = nearbyPoints[0].subtract(centroid);
    const v2 = nearbyPoints[Math.floor(nearbyPoints.length / 2)].subtract(
      centroid
    );

    const normal = v1.cross(v2).normalize();

    // Ensure normal points towards camera (positive Z)
    if (normal.z < 0) {
      return new Vector3(-normal.x, -normal.y, -normal.z);
    }

    return normal;
  }

  /**
   * Build transformation matrix from position and normal
   */
  private buildPlaneTransform(position: Vector3, normal: Vector3): Matrix4 {
    // Create rotation from normal
    const up = normal;
    const right =
      Math.abs(up.y) < 0.999
        ? new Vector3(0, 1, 0).cross(up).normalize()
        : new Vector3(1, 0, 0).cross(up).normalize();
    const forward = right.cross(up).normalize();

    // Build rotation matrix (column-major)
    const rotation = new Float32Array([
      right.x, right.y, right.z, 0,
      up.x, up.y, up.z, 0,
      forward.x, forward.y, forward.z, 0,
      position.x, position.y, position.z, 1,
    ]);

    return new Matrix4(rotation);
  }

  /**
   * Request XR hit test source
   */
  async requestXRHitTestSource(
    options?: XRHitTestOptionsInit
  ): Promise<XRHitTestSource | null> {
    if (!this.xrSession) {
      log.error('No XR session available');
      return null;
    }

    this.xrHitTestSource = await this.xrSession.requestHitTestSource(options);
    return this.xrHitTestSource;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.xrHitTestSource) {
      this.xrHitTestSource.cancel();
      this.xrHitTestSource = null;
    }
  }
}
