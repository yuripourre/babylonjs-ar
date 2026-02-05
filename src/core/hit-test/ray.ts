/**
 * Ray Class
 * Represents a ray in 3D space for raycasting operations
 */

import { Vector3 } from '../math/vector';
import { Matrix4 } from '../math/matrix';

export class Ray {
  constructor(
    public origin: Vector3,
    public direction: Vector3
  ) {
    // Normalize direction
    this.direction = direction.normalize();
  }

  /**
   * Create ray from screen coordinates
   * @param screenX - Screen X coordinate (0 to width)
   * @param screenY - Screen Y coordinate (0 to height)
   * @param width - Screen width
   * @param height - Screen height
   * @param viewMatrix - Camera view matrix
   * @param projectionMatrix - Camera projection matrix
   */
  static fromScreen(
    screenX: number,
    screenY: number,
    width: number,
    height: number,
    viewMatrix: Matrix4,
    projectionMatrix: Matrix4
  ): Ray {
    // Convert screen coordinates to NDC (-1 to 1)
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = -((screenY / height) * 2 - 1); // Flip Y

    // Create ray in clip space
    const clipNear = new Vector3(ndcX, ndcY, -1);
    const clipFar = new Vector3(ndcX, ndcY, 1);

    // Get inverse matrices
    const invProjection = projectionMatrix.inverse();
    const invView = viewMatrix.inverse();

    // Transform to view space
    const viewNear = invProjection.transformPoint(clipNear);
    const viewFar = invProjection.transformPoint(clipFar);

    // Transform to world space
    const worldNear = invView.transformPoint(viewNear);
    const worldFar = invView.transformPoint(viewFar);

    // Ray direction
    const direction = worldFar.subtract(worldNear).normalize();

    return new Ray(worldNear, direction);
  }

  /**
   * Create ray from camera position and direction
   */
  static fromCamera(position: Vector3, direction: Vector3): Ray {
    return new Ray(position, direction);
  }

  /**
   * Get point along ray at distance t
   */
  getPoint(t: number): Vector3 {
    return this.origin.add(this.direction.multiply(t));
  }

  /**
   * Get closest point on ray to a given point
   */
  closestPointToPoint(point: Vector3): Vector3 {
    const toPoint = point.subtract(this.origin);
    const t = toPoint.dot(this.direction);
    return this.getPoint(Math.max(0, t)); // Clamp to ray origin
  }

  /**
   * Get distance from ray to a point
   */
  distanceToPoint(point: Vector3): number {
    const closest = this.closestPointToPoint(point);
    return point.subtract(closest).length();
  }

  /**
   * Transform ray by a matrix
   */
  transform(matrix: Matrix4): Ray {
    const newOrigin = matrix.transformPoint(this.origin);
    const newEnd = matrix.transformPoint(this.origin.add(this.direction));
    const newDirection = newEnd.subtract(newOrigin).normalize();
    return new Ray(newOrigin, newDirection);
  }

  /**
   * Clone ray
   */
  clone(): Ray {
    return new Ray(this.origin.clone(), this.direction.clone());
  }
}
