/**
 * Test Utilities
 * Helper functions and mock objects for testing
 */

import type { Keypoint, FeatureMatch } from '../../src/core/detection/feature-detector';
import type { DetectedPlane } from '../../src/core/detection/plane-detector';
import type { Point3D } from '../../src/core/detection/point-cloud';
import { Vector3 } from '../../src/core/math/vector';
import type { CameraIntrinsics } from '../../src/core/tracking/pose-estimator';

/**
 * Create mock keypoints for testing
 */
export function createMockKeypoints(count: number, width: number = 640, height: number = 480): Keypoint[] {
  const keypoints: Keypoint[] = [];

  for (let i = 0; i < count; i++) {
    keypoints.push({
      x: Math.random() * width,
      y: Math.random() * height,
      angle: Math.random() * Math.PI * 2,
      response: Math.random(),
      octave: Math.floor(Math.random() * 4),
    });
  }

  return keypoints;
}

/**
 * Create mock feature matches
 */
export function createMockMatches(count: number, maxDistance: number = 50): FeatureMatch[] {
  const matches: FeatureMatch[] = [];

  for (let i = 0; i < count; i++) {
    matches.push({
      queryIdx: i,
      trainIdx: i,
      distance: Math.random() * maxDistance,
    });
  }

  return matches;
}

/**
 * Create geometrically consistent keypoint pairs
 */
export function createConsistentKeypointPairs(
  count: number,
  noise: number = 2
): { query: Keypoint[]; train: Keypoint[] } {
  const query: Keypoint[] = [];
  const train: Keypoint[] = [];

  for (let i = 0; i < count; i++) {
    const x = Math.random() * 600 + 20;
    const y = Math.random() * 440 + 20;
    const angle = Math.random() * Math.PI * 2;

    query.push({
      x,
      y,
      angle,
      response: 1.0,
      octave: 0,
    });

    // Train point with slight offset (simulating camera movement)
    train.push({
      x: x + (Math.random() - 0.5) * noise,
      y: y + (Math.random() - 0.5) * noise,
      angle: angle + (Math.random() - 0.5) * 0.1,
      response: 1.0,
      octave: 0,
    });
  }

  return { query, train };
}

/**
 * Create mock detected plane
 */
export function createMockPlane(
  center: Vector3 = new Vector3(0, 0, 0),
  normal: Vector3 = new Vector3(0, 1, 0),
  width: number = 2,
  height: number = 2
): DetectedPlane {
  const halfW = width / 2;
  const halfH = height / 2;

  return {
    id: Math.floor(Math.random() * 10000),
    normal,
    distance: center.dot(normal),
    centroid: center,
    inliers: 100,
    area: width * height,
    orientation: normal.y > 0.8 ? 'horizontal' : 'vertical',
    confidence: 0.9,
    lastSeen: Date.now(),
    boundary: [
      new Vector3(center.x - halfW, center.y, center.z - halfH),
      new Vector3(center.x + halfW, center.y, center.z - halfH),
      new Vector3(center.x + halfW, center.y, center.z + halfH),
      new Vector3(center.x - halfW, center.y, center.z + halfH),
    ],
  };
}

/**
 * Create mock point cloud
 */
export function createMockPointCloud(
  count: number,
  bounds: { min: Vector3; max: Vector3 }
): Point3D[] {
  const points: Point3D[] = [];

  for (let i = 0; i < count; i++) {
    const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
    const y = bounds.min.y + Math.random() * (bounds.max.y - bounds.min.y);
    const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);

    points.push({
      position: new Vector3(x, y, z),
      confidence: Math.random(),
      normal: new Vector3(0, 1, 0), // Simple upward normal
    });
  }

  return points;
}

/**
 * Create mock camera intrinsics
 */
export function createMockIntrinsics(
  width: number = 640,
  height: number = 480,
  fov: number = 60
): CameraIntrinsics {
  const focalLength = (width / 2) / Math.tan((fov * Math.PI / 180) / 2);

  return {
    fx: focalLength,
    fy: focalLength,
    cx: width / 2,
    cy: height / 2,
  };
}

/**
 * Create test image data with pattern
 */
export function createTestImageData(
  width: number,
  height: number,
  pattern: 'checkerboard' | 'gradient' | 'random' = 'checkerboard'
): ImageData {
  const imageData = new ImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      let value = 0;

      switch (pattern) {
        case 'checkerboard':
          value = ((Math.floor(x / 10) + Math.floor(y / 10)) % 2) * 255;
          break;
        case 'gradient':
          value = (x / width) * 255;
          break;
        case 'random':
          value = Math.random() * 255;
          break;
      }

      data[idx] = value;     // R
      data[idx + 1] = value; // G
      data[idx + 2] = value; // B
      data[idx + 3] = 255;   // A
    }
  }

  return imageData;
}

/**
 * Wait for specified milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert that two numbers are approximately equal
 */
export function assertApproxEqual(
  actual: number,
  expected: number,
  tolerance: number = 0.001,
  message?: string
): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      message ||
        `Expected ${actual} to be approximately ${expected} (tolerance: ${tolerance}), diff: ${diff}`
    );
  }
}

/**
 * Assert that a vector is approximately equal to expected
 */
export function assertVectorApproxEqual(
  actual: Vector3,
  expected: Vector3,
  tolerance: number = 0.001,
  message?: string
): void {
  assertApproxEqual(actual.x, expected.x, tolerance, message ? `${message} (x)` : undefined);
  assertApproxEqual(actual.y, expected.y, tolerance, message ? `${message} (y)` : undefined);
  assertApproxEqual(actual.z, expected.z, tolerance, message ? `${message} (z)` : undefined);
}

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(fn: () => Promise<T> | T): Promise<{ result: T; time: number }> {
  const start = performance.now();
  const result = await fn();
  const time = performance.now() - start;
  return { result, time };
}

/**
 * Create mock XR frame (for testing without actual WebXR)
 */
export function createMockXRFrame(): any {
  return {
    session: {
      renderState: {
        baseLayer: null,
      },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
    },
    getPose: () => null,
    getViewerPose: () => null,
    getHitTestResults: () => [],
  };
}

/**
 * Performance assertion helper
 */
export function assertPerformance(
  time: number,
  maxTime: number,
  operation: string
): void {
  if (time > maxTime) {
    throw new Error(
      `Performance issue: ${operation} took ${time.toFixed(2)}ms (max: ${maxTime}ms)`
    );
  }
}
