/**
 * Ray Tests
 */

import { describe, it, expect } from 'bun:test';
import { Ray } from '../../src/core/hit-test/ray';
import { Vector3 } from '../../src/core/math/vector';
import { Matrix4 } from '../../src/core/math/matrix';

describe('Ray', () => {
  describe('constructor', () => {
    it('should create a ray with origin and direction', () => {
      const origin = new Vector3(0, 0, 0);
      const direction = new Vector3(0, 0, -1);
      const ray = new Ray(origin, direction);

      expect(ray.origin).toEqual(origin);
      expect(ray.direction.length()).toBeCloseTo(1, 5); // Direction should be normalized
    });

    it('should normalize the direction vector', () => {
      const origin = new Vector3(0, 0, 0);
      const direction = new Vector3(0, 0, -10); // Not normalized
      const ray = new Ray(origin, direction);

      expect(ray.direction.length()).toBeCloseTo(1, 5);
      expect(ray.direction.z).toBeCloseTo(-1, 5);
    });
  });

  describe('fromScreen', () => {
    it('should create ray from screen center', () => {
      const width = 800;
      const height = 600;
      const viewMatrix = Matrix4.identity();
      const projectionMatrix = Matrix4.perspective(Math.PI / 3, width / height, 0.1, 100);

      const ray = Ray.fromScreen(
        width / 2,
        height / 2,
        width,
        height,
        viewMatrix,
        projectionMatrix
      );

      expect(ray.origin).toBeDefined();
      expect(ray.direction).toBeDefined();
      expect(ray.direction.length()).toBeCloseTo(1, 5);
    });

    it('should create rays with valid directions', () => {
      const width = 800;
      const height = 600;
      const viewMatrix = Matrix4.identity();
      const projectionMatrix = Matrix4.perspective(Math.PI / 3, width / height, 0.1, 100);

      const ray1 = Ray.fromScreen(100, 100, width, height, viewMatrix, projectionMatrix);
      const ray2 = Ray.fromScreen(700, 500, width, height, viewMatrix, projectionMatrix);

      // Both rays should have normalized directions
      expect(ray1.direction.length()).toBeCloseTo(1, 5);
      expect(ray2.direction.length()).toBeCloseTo(1, 5);

      // Both rays should have valid origin points
      expect(ray1.origin).toBeDefined();
      expect(ray2.origin).toBeDefined();
    });
  });

  describe('fromCamera', () => {
    it('should create ray from camera position', () => {
      const position = new Vector3(0, 2, 5);
      const direction = new Vector3(0, 0, -1);

      const ray = Ray.fromCamera(position, direction);

      expect(ray.origin).toEqual(position);
      expect(ray.direction.length()).toBeCloseTo(1, 5);
    });
  });

  describe('getPoint', () => {
    it('should return point along ray at distance t', () => {
      const origin = new Vector3(0, 0, 0);
      const direction = new Vector3(0, 0, -1);
      const ray = new Ray(origin, direction);

      const point1 = ray.getPoint(0);
      const point2 = ray.getPoint(5);
      const point3 = ray.getPoint(10);

      expect(point1.z).toBeCloseTo(0, 5);
      expect(point2.z).toBeCloseTo(-5, 5);
      expect(point3.z).toBeCloseTo(-10, 5);
    });

    it('should handle negative t values', () => {
      const origin = new Vector3(0, 0, 0);
      const direction = new Vector3(0, 0, -1);
      const ray = new Ray(origin, direction);

      const point = ray.getPoint(-5);

      expect(point.z).toBeCloseTo(5, 5); // Behind origin
    });
  });

  describe('closestPointToPoint', () => {
    it('should find closest point on ray to given point', () => {
      const origin = new Vector3(0, 0, 0);
      const direction = new Vector3(0, 0, -1);
      const ray = new Ray(origin, direction);

      const point = new Vector3(2, 0, -5); // 2 units to the side, 5 units along ray
      const closest = ray.closestPointToPoint(point);

      expect(closest.x).toBeCloseTo(0, 5);
      expect(closest.y).toBeCloseTo(0, 5);
      expect(closest.z).toBeCloseTo(-5, 5);
    });

    it('should clamp to ray origin for points behind ray', () => {
      const origin = new Vector3(0, 0, 0);
      const direction = new Vector3(0, 0, -1);
      const ray = new Ray(origin, direction);

      const point = new Vector3(0, 0, 5); // Behind ray origin
      const closest = ray.closestPointToPoint(point);

      expect(closest.x).toBeCloseTo(0, 5);
      expect(closest.y).toBeCloseTo(0, 5);
      expect(closest.z).toBeCloseTo(0, 5); // Clamped to origin
    });
  });

  describe('distanceToPoint', () => {
    it('should calculate distance from ray to point', () => {
      const origin = new Vector3(0, 0, 0);
      const direction = new Vector3(0, 0, -1);
      const ray = new Ray(origin, direction);

      const point1 = new Vector3(2, 0, -5); // 2 units from ray
      const point2 = new Vector3(0, 3, -5); // 3 units from ray
      const point3 = new Vector3(0, 0, -5); // On ray

      expect(ray.distanceToPoint(point1)).toBeCloseTo(2, 5);
      expect(ray.distanceToPoint(point2)).toBeCloseTo(3, 5);
      expect(ray.distanceToPoint(point3)).toBeCloseTo(0, 5);
    });
  });

  describe('transform', () => {
    it('should transform ray by matrix', () => {
      const origin = new Vector3(0, 0, 0);
      const direction = new Vector3(0, 0, -1);
      const ray = new Ray(origin, direction);

      const transform = Matrix4.translation(0, 0, -5);
      const transformedRay = ray.transform(transform);

      expect(transformedRay.origin.z).toBeCloseTo(-5, 5);
      expect(transformedRay.direction.z).toBeCloseTo(-1, 5);
    });
  });

  describe('clone', () => {
    it('should create independent copy of ray', () => {
      const origin = new Vector3(1, 2, 3);
      const direction = new Vector3(0, 0, -1);
      const ray = new Ray(origin, direction);

      const cloned = ray.clone();

      expect(cloned.origin).toEqual(ray.origin);
      expect(cloned.direction).toEqual(ray.direction);

      // Modify original - clone should be unaffected
      ray.origin.x = 10;
      expect(cloned.origin.x).toBe(1);
    });
  });
});
