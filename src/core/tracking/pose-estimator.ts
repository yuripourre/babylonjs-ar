/**
 * Pose Estimator
 * Computes 6DOF pose from marker corners using EPnP algorithm
 */

import { Matrix4 } from '../math/matrix';
import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import type { MarkerCorners } from '../detection/marker-detector';

export interface CameraIntrinsics {
  fx: number; // Focal length X
  fy: number; // Focal length Y
  cx: number; // Principal point X
  cy: number; // Principal point Y
  distortion?: number[]; // Distortion coefficients (k1, k2, p1, p2, k3)
}

export interface Pose {
  position: Vector3;
  rotation: Quaternion;
  matrix: Matrix4;
}

export class PoseEstimator {
  private intrinsics: CameraIntrinsics;

  constructor(intrinsics: CameraIntrinsics) {
    this.intrinsics = intrinsics;
  }

  /**
   * Estimate pose from marker corners
   * Uses simplified P3P/PnP algorithm
   */
  estimatePose(
    corners: MarkerCorners,
    markerSize: number
  ): Pose | null {
    // Define 3D marker corners in marker coordinate system
    // Marker is in XY plane with center at origin
    const half = markerSize / 2;
    const objectPoints: Vector3[] = [
      new Vector3(-half, half, 0),   // Top left
      new Vector3(half, half, 0),    // Top right
      new Vector3(half, -half, 0),   // Bottom right
      new Vector3(-half, -half, 0),  // Bottom left
    ];

    // Image points (pixel coordinates)
    const imagePoints: [number, number][] = [
      corners.topLeft,
      corners.topRight,
      corners.bottomRight,
      corners.bottomLeft,
    ];

    // Undistort image points if distortion coefficients provided
    const undistortedPoints = imagePoints.map(p => this.undistortPoint(p));

    // Normalize image coordinates
    const normalizedPoints = undistortedPoints.map(([x, y]) => {
      return new Vector3(
        (x - this.intrinsics.cx) / this.intrinsics.fx,
        (y - this.intrinsics.cy) / this.intrinsics.fy,
        1.0
      ).normalize();
    });

    // Solve PnP using simplified iterative method
    // In full implementation, use EPnP or similar
    const pose = this.solvePnPIterative(objectPoints, normalizedPoints);

    return pose;
  }

  /**
   * Undistort image point using camera distortion coefficients
   */
  private undistortPoint(point: [number, number]): [number, number] {
    if (!this.intrinsics.distortion || this.intrinsics.distortion.length === 0) {
      return point;
    }

    const [x, y] = point;
    const [k1, k2, p1, p2, k3 = 0] = this.intrinsics.distortion;

    // Convert to normalized coordinates
    const xNorm = (x - this.intrinsics.cx) / this.intrinsics.fx;
    const yNorm = (y - this.intrinsics.cy) / this.intrinsics.fy;

    // Radial distortion
    const r2 = xNorm * xNorm + yNorm * yNorm;
    const r4 = r2 * r2;
    const r6 = r4 * r2;

    const radialDistortion = 1 + k1 * r2 + k2 * r4 + k3 * r6;

    // Tangential distortion
    const tangentialX = 2 * p1 * xNorm * yNorm + p2 * (r2 + 2 * xNorm * xNorm);
    const tangentialY = p1 * (r2 + 2 * yNorm * yNorm) + 2 * p2 * xNorm * yNorm;

    // Apply distortion
    const xDistorted = xNorm * radialDistortion + tangentialX;
    const yDistorted = yNorm * radialDistortion + tangentialY;

    // Convert back to pixel coordinates
    return [
      xDistorted * this.intrinsics.fx + this.intrinsics.cx,
      yDistorted * this.intrinsics.fy + this.intrinsics.cy,
    ];
  }

  /**
   * Solve PnP using iterative method (simplified)
   * Full implementation would use EPnP for efficiency
   */
  private solvePnPIterative(
    objectPoints: Vector3[],
    normalizedPoints: Vector3[]
  ): Pose | null {
    if (objectPoints.length !== 4 || normalizedPoints.length !== 4) {
      return null;
    }

    // Initial pose estimate using coplanar points
    // Simplified: estimate translation from centroid
    const centroid3D = this.computeCentroid(objectPoints);

    // Estimate depth using geometric constraints
    // For a square marker, we can use the distance between corners
    const edge01 = objectPoints[1].subtract(objectPoints[0]).length();
    const imageEdge01 = this.imageDistance(normalizedPoints[0], normalizedPoints[1]);

    // Approximate depth (very simplified)
    const estimatedDepth = edge01 / imageEdge01;

    // Build rotation from correspondences (simplified)
    // In full implementation, use Kabsch algorithm or similar
    const rotation = this.estimateRotation(objectPoints, normalizedPoints, estimatedDepth);

    // Translation
    const position = new Vector3(0, 0, estimatedDepth);

    // Build transformation matrix
    const matrix = this.buildTransformMatrix(position, rotation);

    return {
      position,
      rotation,
      matrix,
    };
  }

  /**
   * Compute centroid of 3D points
   */
  private computeCentroid(points: Vector3[]): Vector3 {
    let sum = new Vector3(0, 0, 0);
    for (const p of points) {
      sum = sum.add(p);
    }
    return sum.multiply(1.0 / points.length);
  }

  /**
   * Compute distance between two normalized image points
   */
  private imageDistance(p1: Vector3, p2: Vector3): number {
    return p1.subtract(p2).length();
  }

  /**
   * Estimate rotation from point correspondences (simplified)
   */
  private estimateRotation(
    objectPoints: Vector3[],
    normalizedPoints: Vector3[],
    depth: number
  ): Quaternion {
    // Simplified rotation estimation
    // In full implementation, use proper orientation estimation

    // For now, return identity rotation
    // TODO: Implement proper rotation estimation using Kabsch or similar
    return Quaternion.identity();
  }

  /**
   * Build 4x4 transformation matrix from position and rotation
   */
  private buildTransformMatrix(position: Vector3, rotation: Quaternion): Matrix4 {
    // Convert quaternion to rotation matrix
    const { x, y, z, w } = rotation;

    const x2 = x * x;
    const y2 = y * y;
    const z2 = z * z;
    const xy = x * y;
    const xz = x * z;
    const yz = y * z;
    const wx = w * x;
    const wy = w * y;
    const wz = w * z;

    const rotationMatrix = new Matrix4([
      1 - 2 * (y2 + z2), 2 * (xy + wz), 2 * (xz - wy), 0,
      2 * (xy - wz), 1 - 2 * (x2 + z2), 2 * (yz + wx), 0,
      2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (x2 + y2), 0,
      position.x, position.y, position.z, 1,
    ]);

    return rotationMatrix;
  }

  /**
   * Update camera intrinsics
   */
  updateIntrinsics(intrinsics: CameraIntrinsics): void {
    this.intrinsics = intrinsics;
  }

  /**
   * Estimate camera intrinsics from image resolution (simple pinhole model)
   */
  static estimateIntrinsics(width: number, height: number, fovDegrees: number = 60): CameraIntrinsics {
    const fovRadians = (fovDegrees * Math.PI) / 180;
    const fx = width / (2 * Math.tan(fovRadians / 2));
    const fy = fx; // Assume square pixels

    return {
      fx,
      fy,
      cx: width / 2,
      cy: height / 2,
    };
  }
}
