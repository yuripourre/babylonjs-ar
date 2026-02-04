import { test, expect, describe } from 'bun:test';
import { Quaternion } from '../../src/core/math/quaternion';
import { Vector3 } from '../../src/core/math/vector';

describe('Quaternion', () => {
  describe('Constructor', () => {
    test('creates identity quaternion by default', () => {
      const q = new Quaternion();
      expect(q.x).toBe(0);
      expect(q.y).toBe(0);
      expect(q.z).toBe(0);
      expect(q.w).toBe(1);
    });

    test('creates quaternion with specified values', () => {
      const q = new Quaternion(1, 2, 3, 4);
      expect(q.x).toBe(1);
      expect(q.y).toBe(2);
      expect(q.z).toBe(3);
      expect(q.w).toBe(4);
    });
  });

  describe('Identity', () => {
    test('creates identity quaternion', () => {
      const q = Quaternion.identity();
      expect(q.w).toBe(1);
      expect(q.x).toBe(0);
      expect(q.y).toBe(0);
      expect(q.z).toBe(0);
    });

    test('identity has unit norm', () => {
      const q = Quaternion.identity();
      expect(q.norm()).toBeCloseTo(1, 5);
    });
  });

  describe('fromAxisAngle', () => {
    test('creates rotation around X axis', () => {
      const axis = new Vector3(1, 0, 0);
      const angle = Math.PI / 2; // 90 degrees
      const q = Quaternion.fromAxisAngle(axis, angle);

      expect(q.x).toBeCloseTo(Math.sin(Math.PI / 4), 5);
      expect(q.y).toBeCloseTo(0, 5);
      expect(q.z).toBeCloseTo(0, 5);
      expect(q.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
    });

    test('zero angle gives identity', () => {
      const axis = new Vector3(1, 0, 0);
      const q = Quaternion.fromAxisAngle(axis, 0);

      expect(q.w).toBeCloseTo(1, 5);
      expect(q.x).toBeCloseTo(0, 5);
    });

    test('normalizes axis automatically', () => {
      const axis = new Vector3(2, 0, 0); // Not unit length
      const angle = Math.PI / 2;
      const q = Quaternion.fromAxisAngle(axis, angle);

      expect(q.norm()).toBeCloseTo(1, 5);
    });
  });

  describe('fromEuler', () => {
    test('creates rotation from Euler angles', () => {
      const q = Quaternion.fromEuler(0, 0, 0);

      expect(q.x).toBeCloseTo(0, 5);
      expect(q.y).toBeCloseTo(0, 5);
      expect(q.z).toBeCloseTo(0, 5);
      expect(q.w).toBeCloseTo(1, 5);
    });

    test('rotation around single axis', () => {
      const q = Quaternion.fromEuler(Math.PI / 2, 0, 0);

      expect(q.x).toBeCloseTo(Math.sin(Math.PI / 4), 5);
      expect(q.y).toBeCloseTo(0, 5);
      expect(q.z).toBeCloseTo(0, 5);
      expect(q.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
    });
  });

  describe('Multiplication', () => {
    test('multiplies two quaternions', () => {
      const q1 = Quaternion.fromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
      const q2 = Quaternion.fromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
      const result = q1.multiply(q2);

      // Should be 180 degree rotation around Z
      expect(result.norm()).toBeCloseTo(1, 5);
    });

    test('identity multiplication', () => {
      const q = new Quaternion(1, 2, 3, 4);
      const identity = Quaternion.identity();
      const result = q.multiply(identity);

      expect(result.x).toBeCloseTo(q.x, 5);
      expect(result.y).toBeCloseTo(q.y, 5);
      expect(result.z).toBeCloseTo(q.z, 5);
      expect(result.w).toBeCloseTo(q.w, 5);
    });

    test('multiplication is not commutative', () => {
      const q1 = Quaternion.fromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
      const q2 = Quaternion.fromAxisAngle(new Vector3(0, 1, 0), Math.PI / 3);

      const r1 = q1.multiply(q2);
      const r2 = q2.multiply(q1);

      // Results should be different (check multiple components)
      const xDiff = Math.abs(r1.x - r2.x);
      const yDiff = Math.abs(r1.y - r2.y);
      const zDiff = Math.abs(r1.z - r2.z);
      const wDiff = Math.abs(r1.w - r2.w);

      expect(xDiff + yDiff + zDiff + wDiff).toBeGreaterThan(0.01);
    });
  });

  describe('Conjugate', () => {
    test('computes conjugate correctly', () => {
      const q = new Quaternion(1, 2, 3, 4);
      const conj = q.conjugate();

      expect(conj.x).toBe(-1);
      expect(conj.y).toBe(-2);
      expect(conj.z).toBe(-3);
      expect(conj.w).toBe(4);
    });

    test('conjugate of conjugate is original', () => {
      const q = new Quaternion(1, 2, 3, 4);
      const conj = q.conjugate().conjugate();

      expect(conj.x).toBe(q.x);
      expect(conj.y).toBe(q.y);
      expect(conj.z).toBe(q.z);
      expect(conj.w).toBe(q.w);
    });
  });

  describe('Norm', () => {
    test('computes norm correctly', () => {
      const q = new Quaternion(0, 0, 0, 1);
      expect(q.norm()).toBe(1);
    });

    test('norm of zero quaternion', () => {
      const q = new Quaternion(0, 0, 0, 0);
      expect(q.norm()).toBe(0);
    });
  });

  describe('Normalize', () => {
    test('normalizes quaternion', () => {
      const q = new Quaternion(1, 2, 3, 4);
      const normalized = q.normalize();

      expect(normalized.norm()).toBeCloseTo(1, 5);
    });

    test('zero quaternion normalizes to identity', () => {
      const q = new Quaternion(0, 0, 0, 0);
      const normalized = q.normalize();

      expect(normalized.w).toBe(1);
      expect(normalized.x).toBe(0);
    });
  });

  describe('SLERP', () => {
    test('interpolates between two quaternions', () => {
      const q1 = Quaternion.identity();
      const q2 = Quaternion.fromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);

      const mid = q1.slerp(q2, 0.5);

      // Should be approximately 45 degree rotation
      expect(mid.norm()).toBeCloseTo(1, 5);
    });

    test('t=0 returns first quaternion', () => {
      const q1 = Quaternion.identity();
      const q2 = Quaternion.fromAxisAngle(new Vector3(1, 0, 0), Math.PI);

      const result = q1.slerp(q2, 0);

      expect(result.x).toBeCloseTo(q1.x, 5);
      expect(result.y).toBeCloseTo(q1.y, 5);
      expect(result.z).toBeCloseTo(q1.z, 5);
      expect(result.w).toBeCloseTo(q1.w, 5);
    });

    test('t=1 returns second quaternion', () => {
      const q1 = Quaternion.identity();
      const q2 = Quaternion.fromAxisAngle(new Vector3(1, 0, 0), Math.PI);

      const result = q1.slerp(q2, 1);

      expect(result.x).toBeCloseTo(q2.x, 5);
      expect(result.y).toBeCloseTo(q2.y, 5);
      expect(result.z).toBeCloseTo(q2.z, 5);
      expect(result.w).toBeCloseTo(q2.w, 5);
    });

    test('result is normalized', () => {
      const q1 = new Quaternion(1, 2, 3, 4).normalize();
      const q2 = new Quaternion(5, 6, 7, 8).normalize();

      const result = q1.slerp(q2, 0.5);

      expect(result.norm()).toBeCloseTo(1, 5);
    });
  });

  describe('Clone', () => {
    test('creates independent copy', () => {
      const q1 = new Quaternion(1, 2, 3, 4);
      const q2 = q1.clone();

      q2.x = 10;

      expect(q1.x).toBe(1);
      expect(q2.x).toBe(10);
    });
  });

  describe('toArray', () => {
    test('converts to array', () => {
      const q = new Quaternion(1, 2, 3, 4);
      const arr = q.toArray();

      expect(arr).toEqual([1, 2, 3, 4]);
    });
  });
});
