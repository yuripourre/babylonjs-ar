/**
 * Matrix Math Utilities
 * 4x4 matrix operations for 3D transformations
 */

import { Vector3 } from './vector';

export class Matrix4 {
  // Column-major order (OpenGL/WebGPU convention)
  data: Float32Array;

  constructor(data?: Float32Array | number[]) {
    if (data) {
      this.data = new Float32Array(data);
    } else {
      this.data = Matrix4.identity().data;
    }
  }

  /**
   * Create identity matrix
   */
  static identity(): Matrix4 {
    return new Matrix4([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }

  /**
   * Create translation matrix
   */
  static translation(x: number, y: number, z: number): Matrix4 {
    return new Matrix4([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, z, 1,
    ]);
  }

  /**
   * Create rotation matrix around X axis
   */
  static rotationX(angle: number): Matrix4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Matrix4([
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1,
    ]);
  }

  /**
   * Create rotation matrix around Y axis
   */
  static rotationY(angle: number): Matrix4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Matrix4([
      c, 0, -s, 0,
      0, 1, 0, 0,
      s, 0, c, 0,
      0, 0, 0, 1,
    ]);
  }

  /**
   * Create rotation matrix around Z axis
   */
  static rotationZ(angle: number): Matrix4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Matrix4([
      c, s, 0, 0,
      -s, c, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }

  /**
   * Create scale matrix
   */
  static scale(x: number, y: number, z: number): Matrix4 {
    return new Matrix4([
      x, 0, 0, 0,
      0, y, 0, 0,
      0, 0, z, 0,
      0, 0, 0, 1,
    ]);
  }

  /**
   * Create perspective projection matrix
   */
  static perspective(fov: number, aspect: number, near: number, far: number): Matrix4 {
    const f = 1.0 / Math.tan(fov / 2);
    const rangeInv = 1.0 / (near - far);

    return new Matrix4([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * rangeInv, -1,
      0, 0, near * far * rangeInv * 2, 0,
    ]);
  }

  /**
   * Matrix multiplication
   */
  multiply(other: Matrix4): Matrix4 {
    const a = this.data;
    const b = other.data;
    const result = new Float32Array(16);

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] =
          a[i * 4 + 0] * b[0 * 4 + j] +
          a[i * 4 + 1] * b[1 * 4 + j] +
          a[i * 4 + 2] * b[2 * 4 + j] +
          a[i * 4 + 3] * b[3 * 4 + j];
      }
    }

    return new Matrix4(result);
  }

  /**
   * Matrix inverse (simplified, assumes no scaling)
   */
  inverse(): Matrix4 {
    // For proper inverse, use Gaussian elimination
    // This is a placeholder for rigid body transforms
    const m = this.data;
    const result = new Float32Array(16);

    // Transpose rotation part
    result[0] = m[0];
    result[1] = m[4];
    result[2] = m[8];
    result[4] = m[1];
    result[5] = m[5];
    result[6] = m[9];
    result[8] = m[2];
    result[9] = m[6];
    result[10] = m[10];

    // Negate and rotate translation
    result[12] = -(m[12] * result[0] + m[13] * result[4] + m[14] * result[8]);
    result[13] = -(m[12] * result[1] + m[13] * result[5] + m[14] * result[9]);
    result[14] = -(m[12] * result[2] + m[13] * result[6] + m[14] * result[10]);
    result[15] = 1;

    return new Matrix4(result);
  }

  /**
   * Get translation component
   */
  getTranslation(): [number, number, number] {
    return [this.data[12], this.data[13], this.data[14]];
  }

  /**
   * Transform a 3D point by this matrix
   */
  transformPoint(point: Vector3): Vector3 {
    const m = this.data;
    const x = point.x;
    const y = point.y;
    const z = point.z;

    // Column-major: [m0 m4 m8  m12]
    //                [m1 m5 m9  m13]
    //                [m2 m6 m10 m14]
    //                [m3 m7 m11 m15]

    const w = m[3] * x + m[7] * y + m[11] * z + m[15];

    return new Vector3(
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
    );
  }

  /**
   * Clone matrix
   */
  clone(): Matrix4 {
    return new Matrix4(this.data.slice());
  }

  /**
   * Compose matrix from position, rotation (quaternion), and scale
   */
  static compose(position: Vector3, rotation: import('./quaternion').Quaternion, scale: Vector3): Matrix4 {
    const rotationMatrix = rotation.toMatrix();
    const result = new Float32Array(16);

    // Apply scale and rotation
    const sx = scale.x, sy = scale.y, sz = scale.z;

    result[0] = rotationMatrix[0] * sx;
    result[1] = rotationMatrix[1] * sx;
    result[2] = rotationMatrix[2] * sx;
    result[3] = 0;

    result[4] = rotationMatrix[4] * sy;
    result[5] = rotationMatrix[5] * sy;
    result[6] = rotationMatrix[6] * sy;
    result[7] = 0;

    result[8] = rotationMatrix[8] * sz;
    result[9] = rotationMatrix[9] * sz;
    result[10] = rotationMatrix[10] * sz;
    result[11] = 0;

    // Apply translation
    result[12] = position.x;
    result[13] = position.y;
    result[14] = position.z;
    result[15] = 1;

    return new Matrix4(result);
  }
}
