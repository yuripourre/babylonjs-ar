import { test, expect, describe } from 'bun:test';
import { PointCloudGenerator } from '../../src/core/detection/point-cloud';
import { Vector3 } from '../../src/core/math/vector';
import { PoseEstimator } from '../../src/core/tracking/pose-estimator';

describe('PointCloudGenerator', () => {
  const intrinsics = PoseEstimator.estimateIntrinsics(640, 480, 60);
  const generator = new PointCloudGenerator(intrinsics);

  describe('generateFromDepth', () => {
    test('generates point cloud from valid depth', () => {
      const width = 10;
      const height = 10;
      const depthData = new Float32Array(width * height);

      // Fill with constant depth
      depthData.fill(2.0);

      const points = generator.generateFromDepth(
        depthData,
        width,
        height,
        0.1,
        10.0,
        1
      );

      expect(points.length).toBeGreaterThan(0);
      expect(points.length % 4).toBe(0); // Should be vec4s
    });

    test('filters out invalid depths', () => {
      const width = 10;
      const height = 10;
      const depthData = new Float32Array(width * height);

      // Mix of valid and invalid depths
      for (let i = 0; i < depthData.length; i++) {
        depthData[i] = i % 2 === 0 ? 2.0 : 0.0; // Half invalid
      }

      const points = generator.generateFromDepth(
        depthData,
        width,
        height,
        0.1,
        10.0,
        1
      );

      // Should have approximately half the points
      expect(points.length / 4).toBeLessThan(width * height);
      expect(points.length / 4).toBeGreaterThan(width * height * 0.4);
    });

    test('respects min/max depth thresholds', () => {
      const width = 10;
      const height = 10;
      const depthData = new Float32Array(width * height);

      // Fill with out-of-range depths
      depthData.fill(15.0);

      const points = generator.generateFromDepth(
        depthData,
        width,
        height,
        0.1,
        10.0,
        1
      );

      expect(points.length).toBe(0);
    });

    test('respects step parameter', () => {
      const width = 20;
      const height = 20;
      const depthData = new Float32Array(width * height);
      depthData.fill(2.0);

      const pointsStep1 = generator.generateFromDepth(
        depthData,
        width,
        height,
        0.1,
        10.0,
        1
      );

      const pointsStep2 = generator.generateFromDepth(
        depthData,
        width,
        height,
        0.1,
        10.0,
        2
      );

      // Step 2 should have ~1/4 the points (step in both dimensions)
      expect(pointsStep2.length).toBeLessThan(pointsStep1.length / 2);
    });
  });

  describe('unproject/project', () => {
    test('unproject creates 3D point', () => {
      const point = generator['unproject'](320, 240, 1.0);

      expect(point).toBeInstanceOf(Vector3);
      expect(point.z).toBeCloseTo(1.0, 5);
    });

    test('project returns 2D coordinates', () => {
      const point3D = new Vector3(0, 0, 1);
      const [x, y, z] = generator.project(point3D);

      expect(x).toBeCloseTo(intrinsics.cx, 1);
      expect(y).toBeCloseTo(intrinsics.cy, 1);
      expect(z).toBeCloseTo(1.0, 5);
    });

    test('project handles point behind camera', () => {
      const point3D = new Vector3(0, 0, -1);
      const [x, y, z] = generator.project(point3D);

      expect(x).toBe(-1);
      expect(y).toBe(-1);
    });

    test('unproject then project is identity', () => {
      const x = 100;
      const y = 100;
      const depth = 2.0;

      const point3D = generator['unproject'](x, y, depth);
      const [projX, projY, projZ] = generator.project(point3D);

      expect(projX).toBeCloseTo(x, 1);
      expect(projY).toBeCloseTo(y, 1);
      expect(projZ).toBeCloseTo(depth, 5);
    });
  });

  describe('downsample', () => {
    test('reduces point count', () => {
      // Create dense point cloud
      const points: number[] = [];
      for (let i = 0; i < 100; i++) {
        points.push(
          Math.random(),
          Math.random(),
          Math.random(),
          1.0
        );
      }

      const original = new Float32Array(points);
      const downsampled = generator.downsample(original, 0.1);

      expect(downsampled.length).toBeLessThan(original.length);
    });

    test('maintains point structure', () => {
      const points = new Float32Array([1, 2, 3, 1, 4, 5, 6, 1]);
      const downsampled = generator.downsample(points, 1.0);

      expect(downsampled.length % 4).toBe(0);
    });

    test('empty input returns empty output', () => {
      const points = new Float32Array([]);
      const downsampled = generator.downsample(points, 0.1);

      expect(downsampled.length).toBe(0);
    });
  });

  describe('filterByDistance', () => {
    test('filters points by distance', () => {
      const points = new Float32Array([
        0, 0, 1, 1,  // Distance 1
        0, 0, 5, 1,  // Distance 5
        0, 0, 10, 1, // Distance 10
      ]);

      const filtered = generator.filterByDistance(points, 2, 8);

      expect(filtered.length).toBe(4); // Only middle point
    });

    test('keeps all points in range', () => {
      const points = new Float32Array([
        0, 0, 3, 1,
        0, 0, 4, 1,
        0, 0, 5, 1,
      ]);

      const filtered = generator.filterByDistance(points, 2, 6);

      expect(filtered.length).toBe(points.length);
    });

    test('removes all points out of range', () => {
      const points = new Float32Array([
        0, 0, 1, 1,
        0, 0, 2, 1,
      ]);

      const filtered = generator.filterByDistance(points, 5, 10);

      expect(filtered.length).toBe(0);
    });
  });

  describe('computeNormals', () => {
    test('generates normals for points', () => {
      // Create a plane of points
      const points: number[] = [];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          points.push(x * 0.1, y * 0.1, 1.0, 1.0);
        }
      }

      const pointsArray = new Float32Array(points);
      const normals = generator.computeNormals(pointsArray, 5);

      expect(normals.length).toBe(pointsArray.length);
    });

    test('normals have unit length', () => {
      const points = new Float32Array([
        0, 0, 1, 1,
        0.1, 0, 1, 1,
        0, 0.1, 1, 1,
        0.1, 0.1, 1, 1,
      ]);

      const normals = generator.computeNormals(points, 3);

      // Check at least one normal
      if (normals[3] > 0.5) {
        // Has valid normal
        const nx = normals[0];
        const ny = normals[1];
        const nz = normals[2];
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);

        expect(length).toBeCloseTo(1.0, 2);
      }
    });
  });
});
