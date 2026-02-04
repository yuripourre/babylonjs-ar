import { test, expect, describe } from 'bun:test';
import { Vector3 } from '../../src/core/math/vector';

describe('Vector3', () => {
  describe('Constructor', () => {
    test('creates zero vector by default', () => {
      const v = new Vector3();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    test('creates vector with specified values', () => {
      const v = new Vector3(1, 2, 3);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
    });
  });

  describe('Addition', () => {
    test('adds two vectors correctly', () => {
      const v1 = new Vector3(1, 2, 3);
      const v2 = new Vector3(4, 5, 6);
      const result = v1.add(v2);

      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
    });

    test('does not modify original vectors', () => {
      const v1 = new Vector3(1, 2, 3);
      const v2 = new Vector3(4, 5, 6);
      v1.add(v2);

      expect(v1.x).toBe(1);
      expect(v2.x).toBe(4);
    });
  });

  describe('Subtraction', () => {
    test('subtracts two vectors correctly', () => {
      const v1 = new Vector3(5, 7, 9);
      const v2 = new Vector3(1, 2, 3);
      const result = v1.subtract(v2);

      expect(result.x).toBe(4);
      expect(result.y).toBe(5);
      expect(result.z).toBe(6);
    });
  });

  describe('Scalar multiplication', () => {
    test('multiplies vector by scalar', () => {
      const v = new Vector3(1, 2, 3);
      const result = v.multiply(2);

      expect(result.x).toBe(2);
      expect(result.y).toBe(4);
      expect(result.z).toBe(6);
    });

    test('multiplies by zero', () => {
      const v = new Vector3(1, 2, 3);
      const result = v.multiply(0);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });
  });

  describe('Dot product', () => {
    test('computes dot product correctly', () => {
      const v1 = new Vector3(1, 2, 3);
      const v2 = new Vector3(4, 5, 6);
      const result = v1.dot(v2);

      // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
      expect(result).toBe(32);
    });

    test('dot product with perpendicular vectors is zero', () => {
      const v1 = new Vector3(1, 0, 0);
      const v2 = new Vector3(0, 1, 0);
      const result = v1.dot(v2);

      expect(result).toBe(0);
    });
  });

  describe('Cross product', () => {
    test('computes cross product correctly', () => {
      const v1 = new Vector3(1, 0, 0);
      const v2 = new Vector3(0, 1, 0);
      const result = v1.cross(v2);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(1);
    });

    test('cross product is anticommutative', () => {
      const v1 = new Vector3(1, 2, 3);
      const v2 = new Vector3(4, 5, 6);

      const r1 = v1.cross(v2);
      const r2 = v2.cross(v1);

      expect(r1.x).toBe(-r2.x);
      expect(r1.y).toBe(-r2.y);
      expect(r1.z).toBe(-r2.z);
    });

    test('cross product with parallel vectors is zero', () => {
      const v1 = new Vector3(1, 2, 3);
      const v2 = new Vector3(2, 4, 6);
      const result = v1.cross(v2);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });
  });

  describe('Length', () => {
    test('computes length correctly', () => {
      const v = new Vector3(3, 4, 0);
      const length = v.length();

      expect(length).toBe(5);
    });

    test('zero vector has zero length', () => {
      const v = new Vector3(0, 0, 0);
      expect(v.length()).toBe(0);
    });

    test('unit vector has length 1', () => {
      const v = new Vector3(1, 0, 0);
      expect(v.length()).toBe(1);
    });
  });

  describe('Normalization', () => {
    test('normalizes vector correctly', () => {
      const v = new Vector3(3, 4, 0);
      const normalized = v.normalize();

      expect(normalized.length()).toBeCloseTo(1, 5);
      expect(normalized.x).toBeCloseTo(0.6, 5);
      expect(normalized.y).toBeCloseTo(0.8, 5);
    });

    test('normalized vector points in same direction', () => {
      const v = new Vector3(1, 2, 3);
      const normalized = v.normalize();

      // Check they're parallel by cross product
      const cross = v.cross(normalized);
      expect(cross.length()).toBeCloseTo(0, 5);
    });

    test('zero vector normalizes to zero', () => {
      const v = new Vector3(0, 0, 0);
      const normalized = v.normalize();

      expect(normalized.x).toBe(0);
      expect(normalized.y).toBe(0);
      expect(normalized.z).toBe(0);
    });
  });

  describe('Distance', () => {
    test('computes distance between vectors', () => {
      const v1 = new Vector3(0, 0, 0);
      const v2 = new Vector3(3, 4, 0);

      expect(v1.distanceTo(v2)).toBe(5);
    });

    test('distance to self is zero', () => {
      const v = new Vector3(1, 2, 3);
      expect(v.distanceTo(v)).toBe(0);
    });
  });

  describe('Clone', () => {
    test('creates independent copy', () => {
      const v1 = new Vector3(1, 2, 3);
      const v2 = v1.clone();

      v2.x = 10;

      expect(v1.x).toBe(1);
      expect(v2.x).toBe(10);
    });
  });

  describe('toArray', () => {
    test('converts to array', () => {
      const v = new Vector3(1, 2, 3);
      const arr = v.toArray();

      expect(arr).toEqual([1, 2, 3]);
    });
  });
});
