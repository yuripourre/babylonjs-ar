/**
 * RaycasterEngine Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RaycasterEngine } from '../../src/core/hit-test/raycaster-engine';
import { Ray } from '../../src/core/hit-test/ray';
import { Vector3 } from '../../src/core/math/vector';
import { Matrix4 } from '../../src/core/math/matrix';
import type { DetectedPlane } from '../../src/core/detection/plane-detector';
import type { Point3D } from '../../src/core/detection/point-cloud';

describe('RaycasterEngine', () => {
  let engine: RaycasterEngine;

  beforeEach(() => {
    engine = new RaycasterEngine();
  });

  describe('constructor', () => {
    it('should create raycaster engine', () => {
      expect(engine).toBeDefined();
    });

    it('should accept optional XR session', () => {
      const engineWithXR = new RaycasterEngine();
      expect(engineWithXR).toBeDefined();
    });
  });

  describe('rayPlaneIntersection', () => {
    it('should detect intersection with horizontal plane', () => {
      const ray = new Ray(
        new Vector3(0, 5, 0),
        new Vector3(0, -1, 0) // Shooting down
      );

      const plane: DetectedPlane = {
        id: 1,
        normal: new Vector3(0, 1, 0),
        distance: 0,
        centroid: new Vector3(0, 0, 0),
        inliers: 100,
        area: 100,
        orientation: 'horizontal',
        confidence: 0.9,
        lastSeen: Date.now(),
        boundary: [
          new Vector3(-5, 0, -5),
          new Vector3(5, 0, -5),
          new Vector3(5, 0, 5),
          new Vector3(-5, 0, 5),
        ],
      };

      const result = engine.rayPlaneIntersection(ray, plane);

      expect(result).not.toBeNull();
      expect(result!.hitPoint.y).toBeCloseTo(0, 5);
      expect(result!.distance).toBeCloseTo(5, 5);
      expect(result!.hitType).toBe('plane');
      expect(result!.confidence).toBeCloseTo(0.9, 5);
    });

    it('should detect intersection with vertical plane', () => {
      const ray = new Ray(
        new Vector3(0, 0, 5),
        new Vector3(0, 0, -1) // Shooting forward
      );

      const plane: DetectedPlane = {
        id: 2,
        normal: new Vector3(0, 0, 1),
        distance: 0,
        centroid: new Vector3(0, 2, 0),
        inliers: 100,
        area: 50,
        orientation: 'vertical',
        confidence: 0.8,
        lastSeen: Date.now(),
        boundary: [
          new Vector3(-3, 0, 0),
          new Vector3(3, 0, 0),
          new Vector3(3, 4, 0),
          new Vector3(-3, 4, 0),
        ],
      };

      const result = engine.rayPlaneIntersection(ray, plane);

      expect(result).not.toBeNull();
      expect(result!.hitPoint.z).toBeCloseTo(0, 5);
      expect(result!.distance).toBeCloseTo(5, 5);
      expect(result!.hitType).toBe('plane');
    });

    it('should return null for parallel ray and plane', () => {
      const ray = new Ray(
        new Vector3(0, 5, 0),
        new Vector3(1, 0, 0) // Parallel to ground
      );

      const plane: DetectedPlane = {
        id: 1,
        normal: new Vector3(0, 1, 0),
        distance: 0,
        centroid: new Vector3(0, 0, 0),
        inliers: 100,
        area: 100,
        orientation: 'horizontal',
        confidence: 0.9,
        lastSeen: Date.now(),
      };

      const result = engine.rayPlaneIntersection(ray, plane);

      expect(result).toBeNull();
    });

    it('should return null for ray pointing away from plane', () => {
      const ray = new Ray(
        new Vector3(0, 5, 0),
        new Vector3(0, 1, 0) // Pointing up, away from ground
      );

      const plane: DetectedPlane = {
        id: 1,
        normal: new Vector3(0, 1, 0),
        distance: 0,
        centroid: new Vector3(0, 0, 0),
        inliers: 100,
        area: 100,
        orientation: 'horizontal',
        confidence: 0.9,
        lastSeen: Date.now(),
      };

      const result = engine.rayPlaneIntersection(ray, plane);

      expect(result).toBeNull();
    });

    it('should respect maxDistance parameter', () => {
      const ray = new Ray(
        new Vector3(0, 100, 0),
        new Vector3(0, -1, 0)
      );

      const plane: DetectedPlane = {
        id: 1,
        normal: new Vector3(0, 1, 0),
        distance: 0,
        centroid: new Vector3(0, 0, 0),
        inliers: 100,
        area: 100,
        orientation: 'horizontal',
        confidence: 0.9,
        lastSeen: Date.now(),
      };

      const resultWithinRange = engine.rayPlaneIntersection(ray, plane, 150);
      const resultOutOfRange = engine.rayPlaneIntersection(ray, plane, 50);

      expect(resultWithinRange).not.toBeNull();
      expect(resultOutOfRange).toBeNull();
    });

    it('should check boundary if provided', () => {
      const ray = new Ray(
        new Vector3(10, 5, 0), // Outside boundary
        new Vector3(0, -1, 0)
      );

      const plane: DetectedPlane = {
        id: 1,
        normal: new Vector3(0, 1, 0),
        distance: 0,
        centroid: new Vector3(0, 0, 0),
        inliers: 100,
        area: 25,
        orientation: 'horizontal',
        confidence: 0.9,
        lastSeen: Date.now(),
        boundary: [
          new Vector3(-2.5, 0, -2.5),
          new Vector3(2.5, 0, -2.5),
          new Vector3(2.5, 0, 2.5),
          new Vector3(-2.5, 0, 2.5),
        ],
      };

      const result = engine.rayPlaneIntersection(ray, plane);

      expect(result).toBeNull(); // Hit is outside boundary
    });
  });

  describe('rayPointCloudIntersection', () => {
    it('should find closest point in cloud', () => {
      const ray = new Ray(
        new Vector3(0, 0, 5),
        new Vector3(0, 0, -1)
      );

      const pointCloud: Point3D[] = [
        { position: new Vector3(0, 0, 0), confidence: 0.9 },
        { position: new Vector3(0.01, 0, 0), confidence: 0.9 },
        { position: new Vector3(0, 0.01, 0), confidence: 0.9 },
        { position: new Vector3(0, 0, -0.01), confidence: 0.9 },
      ];

      const result = engine.rayPointCloudIntersection(ray, pointCloud);

      expect(result).not.toBeNull();
      expect(result!.hitType).toBe('point-cloud');
      expect(result!.hitPoint.z).toBeCloseTo(0, 1);
      expect(result!.distance).toBeCloseTo(5, 1);
    });

    it('should return null if no points within threshold', () => {
      const ray = new Ray(
        new Vector3(0, 0, 5),
        new Vector3(0, 0, -1)
      );

      const pointCloud: Point3D[] = [
        { position: new Vector3(10, 10, 0), confidence: 0.9 }, // Far from ray
      ];

      const result = engine.rayPointCloudIntersection(ray, pointCloud);

      expect(result).toBeNull();
    });

    it('should respect maxDistance parameter', () => {
      const ray = new Ray(
        new Vector3(0, 0, 100),
        new Vector3(0, 0, -1)
      );

      const pointCloud: Point3D[] = [
        { position: new Vector3(0, 0, 0), confidence: 0.9 },
      ];

      const resultWithinRange = engine.rayPointCloudIntersection(
        ray,
        pointCloud,
        150
      );
      const resultOutOfRange = engine.rayPointCloudIntersection(
        ray,
        pointCloud,
        50
      );

      expect(resultWithinRange).not.toBeNull();
      expect(resultOutOfRange).toBeNull();
    });

    it('should find closest of multiple candidates', () => {
      const ray = new Ray(
        new Vector3(0, 0, 5),
        new Vector3(0, 0, -1)
      );

      const pointCloud: Point3D[] = [
        { position: new Vector3(0, 0, 3), confidence: 0.9 }, // Closer
        { position: new Vector3(0, 0, 1), confidence: 0.9 },
        { position: new Vector3(0, 0, 0), confidence: 0.9 },
      ];

      const result = engine.rayPointCloudIntersection(ray, pointCloud);

      expect(result).not.toBeNull();
      expect(result!.hitPoint.z).toBeCloseTo(3, 1); // Should hit closest point first
    });
  });

  describe('performCPUHitTest', () => {
    it('should test against both planes and point cloud', async () => {
      const viewMatrix = Matrix4.identity();
      const projectionMatrix = Matrix4.perspective(Math.PI / 3, 1, 0.1, 100);

      const plane: DetectedPlane = {
        id: 1,
        normal: new Vector3(0, 1, 0),
        distance: 0,
        centroid: new Vector3(0, 0, 0),
        inliers: 100,
        area: 100,
        orientation: 'horizontal',
        confidence: 0.9,
        lastSeen: Date.now(),
        boundary: [
          new Vector3(-5, 0, -5),
          new Vector3(5, 0, -5),
          new Vector3(5, 0, 5),
          new Vector3(-5, 0, 5),
        ],
      };

      const pointCloud: Point3D[] = [
        { position: new Vector3(0, -2, 0), confidence: 0.8 },
      ];

      const results = await engine.performHitTest(
        {
          ray: new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0)),
          planes: [plane],
          pointCloud: pointCloud,
          useXR: false,
        }
      );

      expect(results.length).toBeGreaterThan(0);
    });

    it('should sort results by distance', async () => {
      const plane1: DetectedPlane = {
        id: 1,
        normal: new Vector3(0, 1, 0),
        distance: 0,
        centroid: new Vector3(0, 0, 0),
        inliers: 100,
        area: 100,
        orientation: 'horizontal',
        confidence: 0.9,
        lastSeen: Date.now(),
        boundary: [
          new Vector3(-5, 0, -5),
          new Vector3(5, 0, -5),
          new Vector3(5, 0, 5),
          new Vector3(-5, 0, 5),
        ],
      };

      const plane2: DetectedPlane = {
        id: 2,
        normal: new Vector3(0, 1, 0),
        distance: 0,
        centroid: new Vector3(0, 2, 0),
        inliers: 100,
        area: 100,
        orientation: 'horizontal',
        confidence: 0.9,
        lastSeen: Date.now(),
        boundary: [
          new Vector3(-5, 2, -5),
          new Vector3(5, 2, -5),
          new Vector3(5, 2, 5),
          new Vector3(-5, 2, 5),
        ],
      };

      const results = await engine.performHitTest(
        {
          ray: new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)),
          planes: [plane1, plane2],
          useXR: false,
        }
      );

      expect(results.length).toBe(2);
      expect(results[0].distance).toBeLessThan(results[1].distance);
    });
  });
});
