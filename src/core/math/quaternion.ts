/**
 * Quaternion Math Utilities
 * Quaternion operations for 3D rotations
 */

import { Vector3 } from './vector';

export class Quaternion {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0,
    public w: number = 1
  ) {}

  /**
   * Create identity quaternion
   */
  static identity(): Quaternion {
    return new Quaternion(0, 0, 0, 1);
  }

  /**
   * Create from axis-angle
   */
  static fromAxisAngle(axis: Vector3, angle: number): Quaternion {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    const normalized = axis.normalize();

    return new Quaternion(
      normalized.x * s,
      normalized.y * s,
      normalized.z * s,
      Math.cos(halfAngle)
    );
  }

  /**
   * Create from Euler angles (XYZ order)
   */
  static fromEuler(x: number, y: number, z: number): Quaternion {
    const cx = Math.cos(x / 2);
    const cy = Math.cos(y / 2);
    const cz = Math.cos(z / 2);
    const sx = Math.sin(x / 2);
    const sy = Math.sin(y / 2);
    const sz = Math.sin(z / 2);

    return new Quaternion(
      sx * cy * cz + cx * sy * sz,
      cx * sy * cz - sx * cy * sz,
      cx * cy * sz + sx * sy * cz,
      cx * cy * cz - sx * sy * sz
    );
  }

  /**
   * Multiply two quaternions
   */
  multiply(other: Quaternion): Quaternion {
    return new Quaternion(
      this.w * other.x + this.x * other.w + this.y * other.z - this.z * other.y,
      this.w * other.y + this.y * other.w + this.z * other.x - this.x * other.z,
      this.w * other.z + this.z * other.w + this.x * other.y - this.y * other.x,
      this.w * other.w - this.x * other.x - this.y * other.y - this.z * other.z
    );
  }

  /**
   * Quaternion conjugate
   */
  conjugate(): Quaternion {
    return new Quaternion(-this.x, -this.y, -this.z, this.w);
  }

  /**
   * Quaternion norm
   */
  norm(): number {
    return Math.sqrt(
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
  }

  /**
   * Normalize quaternion
   */
  normalize(): Quaternion {
    const n = this.norm();
    if (n === 0) return Quaternion.identity();
    return new Quaternion(this.x / n, this.y / n, this.z / n, this.w / n);
  }

  /**
   * Spherical linear interpolation
   */
  slerp(other: Quaternion, t: number): Quaternion {
    let dot = this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w;

    // If negative dot, negate one quaternion to take shorter path
    let q2 = other;
    if (dot < 0) {
      q2 = new Quaternion(-other.x, -other.y, -other.z, -other.w);
      dot = -dot;
    }

    // Clamp dot
    dot = Math.max(-1, Math.min(1, dot));

    // Spherical interpolation
    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);

    if (sinTheta < 0.001) {
      // Linear interpolation for small angles
      return new Quaternion(
        this.x + t * (q2.x - this.x),
        this.y + t * (q2.y - this.y),
        this.z + t * (q2.z - this.z),
        this.w + t * (q2.w - this.w)
      ).normalize();
    }

    const a = Math.sin((1 - t) * theta) / sinTheta;
    const b = Math.sin(t * theta) / sinTheta;

    return new Quaternion(
      a * this.x + b * q2.x,
      a * this.y + b * q2.y,
      a * this.z + b * q2.z,
      a * this.w + b * q2.w
    );
  }

  /**
   * Clone quaternion
   */
  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  /**
   * Convert to array
   */
  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }

  /**
   * Static utility: Multiply two quaternions
   */
  static multiply(a: Quaternion, b: Quaternion): Quaternion {
    return a.multiply(b);
  }

  /**
   * Static utility: Conjugate of quaternion
   */
  static conjugate(q: Quaternion): Quaternion {
    return q.conjugate();
  }

  /**
   * Convert quaternion to 4x4 rotation matrix
   */
  toMatrix(): Float32Array {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    // Column-major order
    return new Float32Array([
      1 - (yy + zz), xy + wz, xz - wy, 0,
      xy - wz, 1 - (xx + zz), yz + wx, 0,
      xz + wy, yz - wx, 1 - (xx + yy), 0,
      0, 0, 0, 1
    ]);
  }
}
