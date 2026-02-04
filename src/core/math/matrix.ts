/**
 * Matrix Math Utilities
 * 4x4 matrix operations for 3D transformations
 */

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
   * Clone matrix
   */
  clone(): Matrix4 {
    return new Matrix4(this.data.slice());
  }
}
