/**
 * Vector Math Utilities
 * 3D vector operations
 */

export class Vector3 {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0
  ) {}

  /**
   * Add two vectors
   */
  add(other: Vector3): Vector3 {
    return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  /**
   * Subtract two vectors
   */
  subtract(other: Vector3): Vector3 {
    return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  /**
   * Multiply by scalar
   */
  multiply(scalar: number): Vector3 {
    return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  /**
   * Dot product
   */
  dot(other: Vector3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  /**
   * Cross product
   */
  cross(other: Vector3): Vector3 {
    return new Vector3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x
    );
  }

  /**
   * Vector length
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /**
   * Normalize vector
   */
  normalize(): Vector3 {
    const len = this.length();
    if (len === 0) {return new Vector3(0, 0, 0);}
    return new Vector3(this.x / len, this.y / len, this.z / len);
  }

  /**
   * Distance to another vector
   */
  distanceTo(other: Vector3): number {
    return this.subtract(other).length();
  }

  /**
   * Squared distance to another vector (faster, avoids sqrt)
   */
  distanceToSquared(other: Vector3): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * Linear interpolation to another vector
   */
  lerp(other: Vector3, t: number): Vector3 {
    return new Vector3(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t,
      this.z + (other.z - this.z) * t
    );
  }

  /**
   * Clone vector
   */
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  /**
   * Convert to array
   */
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  /**
   * Static utility: Distance between two vectors
   */
  static distance(a: Vector3, b: Vector3): number {
    return a.distanceTo(b);
  }

  /**
   * Static utility: Dot product
   */
  static dot(a: Vector3, b: Vector3): number {
    return a.dot(b);
  }
}
