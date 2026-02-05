/**
 * Matrix Operations
 * Utility functions for matrix math (for Kalman filtering, optimization, etc.)
 */

export class Matrix {
  /**
   * Create identity matrix
   */
  static identity(size: number): number[][] {
    const matrix: number[][] = [];
    for (let i = 0; i < size; i++) {
      matrix[i] = [];
      for (let j = 0; j < size; j++) {
        matrix[i][j] = i === j ? 1 : 0;
      }
    }
    return matrix;
  }

  /**
   * Create zero matrix
   */
  static zeros(rows: number, cols: number): number[][] {
    const matrix: number[][] = [];
    for (let i = 0; i < rows; i++) {
      matrix[i] = new Array(cols).fill(0);
    }
    return matrix;
  }

  /**
   * Matrix multiplication: C = A * B
   */
  static multiply(A: number[][], B: number[][]): number[][] {
    const rowsA = A.length;
    const colsA = A[0].length;
    const rowsB = B.length;
    const colsB = B[0].length;

    if (colsA !== rowsB) {
      throw new Error(`Matrix dimensions mismatch: ${colsA} !== ${rowsB}`);
    }

    const C: number[][] = [];
    for (let i = 0; i < rowsA; i++) {
      C[i] = [];
      for (let j = 0; j < colsB; j++) {
        C[i][j] = 0;
        for (let k = 0; k < colsA; k++) {
          C[i][j] += A[i][k] * B[k][j];
        }
      }
    }

    return C;
  }

  /**
   * Matrix-vector multiplication: y = A * x
   */
  static multiplyVector(A: number[][], x: number[]): number[] {
    const rows = A.length;
    const cols = A[0].length;

    if (cols !== x.length) {
      throw new Error(`Dimension mismatch: ${cols} !== ${x.length}`);
    }

    const y: number[] = new Array(rows).fill(0);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        y[i] += A[i][j] * x[j];
      }
    }

    return y;
  }

  /**
   * Matrix transpose: A^T
   */
  static transpose(A: number[][]): number[][] {
    const rows = A.length;
    const cols = A[0].length;

    const At: number[][] = [];
    for (let i = 0; i < cols; i++) {
      At[i] = [];
      for (let j = 0; j < rows; j++) {
        At[i][j] = A[j][i];
      }
    }

    return At;
  }

  /**
   * Matrix addition: C = A + B
   */
  static add(A: number[][], B: number[][]): number[][] {
    const rows = A.length;
    const cols = A[0].length;

    if (rows !== B.length || cols !== B[0].length) {
      throw new Error('Matrix dimensions must match for addition');
    }

    const C: number[][] = [];
    for (let i = 0; i < rows; i++) {
      C[i] = [];
      for (let j = 0; j < cols; j++) {
        C[i][j] = A[i][j] + B[i][j];
      }
    }

    return C;
  }

  /**
   * Matrix subtraction: C = A - B
   */
  static subtract(A: number[][], B: number[][]): number[][] {
    const rows = A.length;
    const cols = A[0].length;

    if (rows !== B.length || cols !== B[0].length) {
      throw new Error('Matrix dimensions must match for subtraction');
    }

    const C: number[][] = [];
    for (let i = 0; i < rows; i++) {
      C[i] = [];
      for (let j = 0; j < cols; j++) {
        C[i][j] = A[i][j] - B[i][j];
      }
    }

    return C;
  }

  /**
   * Matrix inversion (Gauss-Jordan elimination)
   * Only works for square matrices
   */
  static invert(A: number[][]): number[][] {
    const n = A.length;

    if (n !== A[0].length) {
      throw new Error('Matrix must be square for inversion');
    }

    // Create augmented matrix [A | I]
    const aug: number[][] = [];
    for (let i = 0; i < n; i++) {
      aug[i] = [...A[i]];
      for (let j = 0; j < n; j++) {
        aug[i].push(i === j ? 1 : 0);
      }
    }

    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
          maxRow = k;
        }
      }

      // Swap rows
      [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

      // Check for singular matrix
      if (Math.abs(aug[i][i]) < 1e-10) {
        throw new Error('Matrix is singular or nearly singular');
      }

      // Scale pivot row
      const pivot = aug[i][i];
      for (let j = 0; j < 2 * n; j++) {
        aug[i][j] /= pivot;
      }

      // Eliminate column
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = aug[k][i];
          for (let j = 0; j < 2 * n; j++) {
            aug[k][j] -= factor * aug[i][j];
          }
        }
      }
    }

    // Extract inverse from augmented matrix
    const inv: number[][] = [];
    for (let i = 0; i < n; i++) {
      inv[i] = aug[i].slice(n);
    }

    return inv;
  }

  /**
   * Matrix determinant (Laplace expansion - for small matrices)
   */
  static determinant(A: number[][]): number {
    const n = A.length;

    if (n !== A[0].length) {
      throw new Error('Matrix must be square');
    }

    if (n === 1) {
      return A[0][0];
    }

    if (n === 2) {
      return A[0][0] * A[1][1] - A[0][1] * A[1][0];
    }

    if (n === 3) {
      return (
        A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
        A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
        A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])
      );
    }

    // For larger matrices, use Laplace expansion (slow, but works)
    let det = 0;
    for (let j = 0; j < n; j++) {
      det += (j % 2 === 0 ? 1 : -1) * A[0][j] * this.determinant(this.minor(A, 0, j));
    }

    return det;
  }

  /**
   * Get minor matrix (remove row i, column j)
   */
  static minor(A: number[][], row: number, col: number): number[][] {
    const n = A.length;
    const minor: number[][] = [];

    for (let i = 0; i < n; i++) {
      if (i === row) continue;

      const minorRow: number[] = [];
      for (let j = 0; j < n; j++) {
        if (j === col) continue;
        minorRow.push(A[i][j]);
      }

      minor.push(minorRow);
    }

    return minor;
  }

  /**
   * Scalar multiplication: C = scalar * A
   */
  static scale(A: number[][], scalar: number): number[][] {
    return A.map(row => row.map(val => val * scalar));
  }

  /**
   * Matrix trace (sum of diagonal elements)
   */
  static trace(A: number[][]): number {
    const n = Math.min(A.length, A[0].length);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += A[i][i];
    }
    return sum;
  }

  /**
   * Frobenius norm
   */
  static norm(A: number[][]): number {
    let sum = 0;
    for (const row of A) {
      for (const val of row) {
        sum += val * val;
      }
    }
    return Math.sqrt(sum);
  }

  /**
   * Check if matrix is symmetric
   */
  static isSymmetric(A: number[][], epsilon: number = 1e-10): boolean {
    const n = A.length;

    if (n !== A[0].length) {
      return false;
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(A[i][j] - A[j][i]) > epsilon) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Print matrix (for debugging)
   */
  static print(A: number[][], label?: string): void {
    if (label) {
      console.log(`Matrix: ${label}`);
    }

    for (const row of A) {
      console.log(row.map(v => v.toFixed(4)).join('  '));
    }
  }

  /**
   * Create diagonal matrix
   */
  static diagonal(values: number[]): number[][] {
    const n = values.length;
    const D = this.zeros(n, n);

    for (let i = 0; i < n; i++) {
      D[i][i] = values[i];
    }

    return D;
  }

  /**
   * Extract diagonal elements
   */
  static getDiagonal(A: number[][]): number[] {
    const n = Math.min(A.length, A[0].length);
    const diagonal: number[] = [];

    for (let i = 0; i < n; i++) {
      diagonal.push(A[i][i]);
    }

    return diagonal;
  }
}
