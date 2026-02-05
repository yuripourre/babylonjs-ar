/**
 * Kabsch Algorithm
 * Computes optimal rotation matrix between two sets of paired points
 *
 * Also known as:
 * - Orthogonal Procrustes Problem
 * - Wahba's Problem (in spacecraft attitude determination)
 *
 * Based on:
 * "A solution for the best rotation to relate two sets of vectors"
 * by Wolfgang Kabsch (1976, 1978)
 *
 * Applications:
 * - Rigid body alignment
 * - Point cloud registration
 * - Protein structure alignment (original application)
 * - Pose estimation from point correspondences
 */

import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import { Matrix4 } from '../math/matrix';

export interface KabschResult {
  rotation: Quaternion;
  rotationMatrix: Matrix4;
  rmsd: number; // Root Mean Square Deviation
}

export class Kabsch {
  /**
   * Compute optimal rotation between two point sets
   *
   * @param P - Source points (centered at origin)
   * @param Q - Target points (centered at origin)
   * @returns Rotation that best aligns P to Q
   */
  static computeRotation(P: Vector3[], Q: Vector3[]): KabschResult | null {
    const n = P.length;
    if (n < 3 || n !== Q.length) {
      return null; // Need at least 3 points
    }

    // Step 1: Compute cross-covariance matrix H = P^T * Q
    const H = this.computeCovarianceMatrix(P, Q);

    // Step 2: Compute SVD of H: H = U * S * V^T
    const { U, S, V } = this.computeSVD3x3(H);

    // Step 3: Compute rotation matrix R = V * U^T
    // Check for reflection (det(R) = -1) and correct if needed
    let R = this.multiplyMatrices3x3(V, this.transpose3x3(U));

    const det = this.det3x3(R);
    if (det < 0) {
      // Reflection detected, flip last column of V
      V[2] = -V[2];
      V[5] = -V[5];
      V[8] = -V[8];
      R = this.multiplyMatrices3x3(V, this.transpose3x3(U));
    }

    // Step 4: Convert rotation matrix to quaternion
    const rotation = this.matrixToQuaternion(R);

    // Step 5: Compute RMSD (Root Mean Square Deviation)
    const rmsd = this.computeRMSD(P, Q, R);

    // Step 6: Build 4x4 rotation matrix
    const rotationMatrix = this.toMatrix4(R);

    return { rotation, rotationMatrix, rmsd };
  }

  /**
   * Compute optimal rigid transformation (rotation + translation)
   * Points can be uncentered
   */
  static computeRigidTransform(
    P: Vector3[],
    Q: Vector3[]
  ): { rotation: Quaternion; translation: Vector3; rmsd: number } | null {
    const n = P.length;
    if (n < 3 || n !== Q.length) {
      return null;
    }

    // Step 1: Compute centroids
    const centroidP = this.computeCentroid(P);
    const centroidQ = this.computeCentroid(Q);

    // Step 2: Center point sets
    const P_centered = P.map(p => p.subtract(centroidP));
    const Q_centered = Q.map(q => q.subtract(centroidQ));

    // Step 3: Compute optimal rotation
    const result = this.computeRotation(P_centered, Q_centered);
    if (!result) {return null;}

    // Step 4: Compute translation: t = centroidQ - R * centroidP
    const rotatedCentroidP = this.applyRotation(centroidP, result.rotation);
    const translation = centroidQ.subtract(rotatedCentroidP);

    return {
      rotation: result.rotation,
      translation,
      rmsd: result.rmsd,
    };
  }

  /**
   * Compute covariance matrix H = P^T * Q
   */
  private static computeCovarianceMatrix(P: Vector3[], Q: Vector3[]): number[] {
    const H = new Array(9).fill(0); // 3x3 matrix (row-major)

    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const q = Q[i];

      // H = Σ(p_i ⊗ q_i) where ⊗ is outer product
      H[0] += p.x * q.x; H[1] += p.x * q.y; H[2] += p.x * q.z;
      H[3] += p.y * q.x; H[4] += p.y * q.y; H[5] += p.y * q.z;
      H[6] += p.z * q.x; H[7] += p.z * q.y; H[8] += p.z * q.z;
    }

    return H;
  }

  /**
   * Compute SVD of 3x3 matrix using Jacobi eigenvalue algorithm
   * Returns U, S, V such that H = U * S * V^T
   */
  private static computeSVD3x3(H: number[]): {
    U: number[];
    S: number[];
    V: number[];
  } {
    // Form the symmetric matrix A = H^T * H
    const HTH = this.multiplyMatrices3x3(this.transpose3x3(H), H);

    // Compute eigendecomposition of A = V * Lambda * V^T
    const { eigenvalues, eigenvectors } = this.eigendecompose3x3(HTH);

    // Singular values are sqrt(eigenvalues)
    const S = eigenvalues.map(lambda => Math.sqrt(Math.max(0, lambda)));

    // V is the eigenvector matrix
    const V = eigenvectors;

    // Compute U = H * V * S^-1
    const U = this.computeU(H, V, S);

    return { U, S, V };
  }

  /**
   * Compute U = H * V * S^-1 for SVD
   */
  private static computeU(H: number[], V: number[], S: number[]): number[] {
    const U = new Array(9);

    for (let col = 0; col < 3; col++) {
      // Compute H * V[:, col]
      const v = [V[col], V[col + 3], V[col + 6]];
      const hv = [
        H[0] * v[0] + H[1] * v[1] + H[2] * v[2],
        H[3] * v[0] + H[4] * v[1] + H[5] * v[2],
        H[6] * v[0] + H[7] * v[1] + H[8] * v[2],
      ];

      // Divide by singular value (or set to zero if singular)
      const s = S[col];
      if (s > 1e-10) {
        U[col] = hv[0] / s;
        U[col + 3] = hv[1] / s;
        U[col + 6] = hv[2] / s;
      } else {
        U[col] = 0;
        U[col + 3] = 0;
        U[col + 6] = 0;
      }
    }

    return U;
  }

  /**
   * Eigendecomposition of symmetric 3x3 matrix using Jacobi algorithm
   */
  private static eigendecompose3x3(A: number[]): {
    eigenvalues: number[];
    eigenvectors: number[];
  } {
    // Initialize eigenvectors to identity
    const V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const A_copy = [...A];

    const maxIterations = 50;
    const tolerance = 1e-10;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Find largest off-diagonal element
      let p = 0,
        q = 1;
      let maxOffDiag = Math.abs(A_copy[1]);

      if (Math.abs(A_copy[2]) > maxOffDiag) {
        maxOffDiag = Math.abs(A_copy[2]);
        p = 0;
        q = 2;
      }
      if (Math.abs(A_copy[5]) > maxOffDiag) {
        maxOffDiag = Math.abs(A_copy[5]);
        p = 1;
        q = 2;
      }

      if (maxOffDiag < tolerance) {
        break; // Converged
      }

      // Compute Jacobi rotation
      this.jacobiRotation(A_copy, V, p, q);
    }

    // Extract eigenvalues (diagonal of A) and sort
    const eigenvalues = [A_copy[0], A_copy[4], A_copy[8]];
    const indices = [0, 1, 2].sort((i, j) => eigenvalues[j] - eigenvalues[i]);

    // Reorder eigenvalues and eigenvectors
    const sortedEigenvalues = indices.map(i => eigenvalues[i]);
    const sortedEigenvectors = new Array(9);
    for (let col = 0; col < 3; col++) {
      const srcCol = indices[col];
      sortedEigenvectors[col] = V[srcCol];
      sortedEigenvectors[col + 3] = V[srcCol + 3];
      sortedEigenvectors[col + 6] = V[srcCol + 6];
    }

    return {
      eigenvalues: sortedEigenvalues,
      eigenvectors: sortedEigenvectors,
    };
  }

  /**
   * Apply Jacobi rotation to eliminate off-diagonal element A[p,q]
   */
  private static jacobiRotation(A: number[], V: number[], p: number, q: number): void {
    const pIdx = p;
    const qIdx = q;
    const ppIdx = p * 3 + p;
    const qqIdx = q * 3 + q;
    const pqIdx = p * 3 + q;

    const app = A[ppIdx];
    const aqq = A[qqIdx];
    const apq = A[pqIdx];

    // Compute rotation angle
    const tau = (aqq - app) / (2 * apq);
    const t = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    // Update A
    A[ppIdx] = app - t * apq;
    A[qqIdx] = aqq + t * apq;
    A[pqIdx] = 0;
    A[qIdx * 3 + pIdx] = 0;

    // Update other elements
    for (let i = 0; i < 3; i++) {
      if (i !== p && i !== q) {
        const aip = A[i * 3 + p];
        const aiq = A[i * 3 + q];
        A[i * 3 + p] = c * aip - s * aiq;
        A[i * 3 + q] = s * aip + c * aiq;
        A[p * 3 + i] = A[i * 3 + p];
        A[q * 3 + i] = A[i * 3 + q];
      }
    }

    // Update eigenvectors V
    for (let i = 0; i < 3; i++) {
      const vip = V[i * 3 + p];
      const viq = V[i * 3 + q];
      V[i * 3 + p] = c * vip - s * viq;
      V[i * 3 + q] = s * vip + c * viq;
    }
  }

  /**
   * Convert 3x3 rotation matrix to quaternion
   */
  private static matrixToQuaternion(R: number[]): Quaternion {
    const trace = R[0] + R[4] + R[8];

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      return new Quaternion(
        (R[7] - R[5]) * s,
        (R[2] - R[6]) * s,
        (R[3] - R[1]) * s,
        0.25 / s
      );
    } else if (R[0] > R[4] && R[0] > R[8]) {
      const s = 2.0 * Math.sqrt(1.0 + R[0] - R[4] - R[8]);
      return new Quaternion(
        0.25 * s,
        (R[1] + R[3]) / s,
        (R[2] + R[6]) / s,
        (R[7] - R[5]) / s
      );
    } else if (R[4] > R[8]) {
      const s = 2.0 * Math.sqrt(1.0 + R[4] - R[0] - R[8]);
      return new Quaternion(
        (R[1] + R[3]) / s,
        0.25 * s,
        (R[5] + R[7]) / s,
        (R[2] - R[6]) / s
      );
    } else {
      const s = 2.0 * Math.sqrt(1.0 + R[8] - R[0] - R[4]);
      return new Quaternion(
        (R[2] + R[6]) / s,
        (R[5] + R[7]) / s,
        0.25 * s,
        (R[3] - R[1]) / s
      );
    }
  }

  /**
   * Compute RMSD between P and Q after rotation
   */
  private static computeRMSD(P: Vector3[], Q: Vector3[], R: number[]): number {
    let sumSquaredDist = 0;

    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const q = Q[i];

      // Rotate P
      const rotatedP = new Vector3(
        R[0] * p.x + R[1] * p.y + R[2] * p.z,
        R[3] * p.x + R[4] * p.y + R[5] * p.z,
        R[6] * p.x + R[7] * p.y + R[8] * p.z
      );

      // Compute squared distance
      const diff = rotatedP.subtract(q);
      sumSquaredDist += diff.dot(diff);
    }

    return Math.sqrt(sumSquaredDist / P.length);
  }

  // Matrix utility functions

  private static multiplyMatrices3x3(A: number[], B: number[]): number[] {
    return [
      A[0] * B[0] + A[1] * B[3] + A[2] * B[6],
      A[0] * B[1] + A[1] * B[4] + A[2] * B[7],
      A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
      A[3] * B[0] + A[4] * B[3] + A[5] * B[6],
      A[3] * B[1] + A[4] * B[4] + A[5] * B[7],
      A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
      A[6] * B[0] + A[7] * B[3] + A[8] * B[6],
      A[6] * B[1] + A[7] * B[4] + A[8] * B[7],
      A[6] * B[2] + A[7] * B[5] + A[8] * B[8],
    ];
  }

  private static transpose3x3(A: number[]): number[] {
    return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
  }

  private static det3x3(m: number[]): number {
    return (
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[1] * (m[3] * m[8] - m[5] * m[6]) +
      m[2] * (m[3] * m[7] - m[4] * m[6])
    );
  }

  private static toMatrix4(R: number[]): Matrix4 {
    return new Matrix4([
      R[0], R[1], R[2], 0,
      R[3], R[4], R[5], 0,
      R[6], R[7], R[8], 0,
      0, 0, 0, 1,
    ]);
  }

  private static computeCentroid(points: Vector3[]): Vector3 {
    let sum = new Vector3(0, 0, 0);
    for (const p of points) {
      sum = sum.add(p);
    }
    return sum.multiply(1.0 / points.length);
  }

  private static applyRotation(point: Vector3, quaternion: Quaternion): Vector3 {
    // q * p * q^-1
    const qv = new Vector3(quaternion.x, quaternion.y, quaternion.z);
    const uv = qv.cross(point);
    const uuv = qv.cross(uv);

    return point.add(uv.multiply(2 * quaternion.w)).add(uuv.multiply(2));
  }
}
