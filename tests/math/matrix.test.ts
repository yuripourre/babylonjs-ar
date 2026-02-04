import { test, expect, describe } from 'bun:test';
import { Matrix4 } from '../../src/core/math/matrix';

describe('Matrix4', () => {
  describe('Constructor', () => {
    test('creates identity matrix by default', () => {
      const m = new Matrix4();

      expect(m.data[0]).toBe(1);
      expect(m.data[5]).toBe(1);
      expect(m.data[10]).toBe(1);
      expect(m.data[15]).toBe(1);

      expect(m.data[1]).toBe(0);
      expect(m.data[4]).toBe(0);
    });

    test('creates matrix with provided data', () => {
      const data = new Float32Array(16);
      data[0] = 2;
      const m = new Matrix4(data);

      expect(m.data[0]).toBe(2);
    });
  });

  describe('Identity', () => {
    test('creates identity matrix', () => {
      const m = Matrix4.identity();

      expect(m.data[0]).toBe(1);
      expect(m.data[5]).toBe(1);
      expect(m.data[10]).toBe(1);
      expect(m.data[15]).toBe(1);
    });
  });

  describe('Translation', () => {
    test('creates translation matrix', () => {
      const m = Matrix4.translation(1, 2, 3);
      const translation = m.getTranslation();

      expect(translation[0]).toBe(1);
      expect(translation[1]).toBe(2);
      expect(translation[2]).toBe(3);
    });

    test('identity has zero translation', () => {
      const m = Matrix4.identity();
      const translation = m.getTranslation();

      expect(translation[0]).toBe(0);
      expect(translation[1]).toBe(0);
      expect(translation[2]).toBe(0);
    });
  });

  describe('Rotation X', () => {
    test('creates rotation matrix around X axis', () => {
      const m = Matrix4.rotationX(Math.PI / 2);

      expect(m.data[0]).toBeCloseTo(1, 5);
      expect(m.data[5]).toBeCloseTo(0, 5);
      expect(m.data[6]).toBeCloseTo(1, 5);
    });

    test('zero rotation is identity', () => {
      const m = Matrix4.rotationX(0);
      const identity = Matrix4.identity();

      for (let i = 0; i < 16; i++) {
        expect(m.data[i]).toBeCloseTo(identity.data[i], 5);
      }
    });
  });

  describe('Rotation Y', () => {
    test('creates rotation matrix around Y axis', () => {
      const m = Matrix4.rotationY(Math.PI / 2);

      expect(m.data[0]).toBeCloseTo(0, 5);
      expect(m.data[2]).toBeCloseTo(-1, 5);
      expect(m.data[5]).toBeCloseTo(1, 5);
    });
  });

  describe('Rotation Z', () => {
    test('creates rotation matrix around Z axis', () => {
      const m = Matrix4.rotationZ(Math.PI / 2);

      expect(m.data[0]).toBeCloseTo(0, 5);
      expect(m.data[1]).toBeCloseTo(1, 5);
      expect(m.data[5]).toBeCloseTo(0, 5);
    });
  });

  describe('Scale', () => {
    test('creates scale matrix', () => {
      const m = Matrix4.scale(2, 3, 4);

      expect(m.data[0]).toBe(2);
      expect(m.data[5]).toBe(3);
      expect(m.data[10]).toBe(4);
      expect(m.data[15]).toBe(1);
    });

    test('uniform scale', () => {
      const m = Matrix4.scale(2, 2, 2);

      expect(m.data[0]).toBe(2);
      expect(m.data[5]).toBe(2);
      expect(m.data[10]).toBe(2);
    });
  });

  describe('Perspective', () => {
    test('creates perspective projection matrix', () => {
      const fov = Math.PI / 4; // 45 degrees
      const aspect = 16 / 9;
      const near = 0.1;
      const far = 100;

      const m = Matrix4.perspective(fov, aspect, near, far);

      // Just verify it's not identity
      expect(m.data[0]).not.toBe(1);
      expect(m.data[11]).toBe(-1); // Perspective divide
    });
  });

  describe('Multiply', () => {
    test('multiplies two matrices', () => {
      const m1 = Matrix4.translation(1, 0, 0);
      const m2 = Matrix4.translation(0, 1, 0);
      const result = m1.multiply(m2);

      const translation = result.getTranslation();
      expect(translation[0]).toBeCloseTo(1, 5);
      expect(translation[1]).toBeCloseTo(1, 5);
    });

    test('identity multiplication', () => {
      const m = Matrix4.translation(1, 2, 3);
      const identity = Matrix4.identity();
      const result = m.multiply(identity);

      const translation = result.getTranslation();
      expect(translation[0]).toBeCloseTo(1, 5);
      expect(translation[1]).toBeCloseTo(2, 5);
      expect(translation[2]).toBeCloseTo(3, 5);
    });

    test('multiplication is not commutative', () => {
      const m1 = Matrix4.rotationX(Math.PI / 4);
      const m2 = Matrix4.rotationY(Math.PI / 4);

      const r1 = m1.multiply(m2);
      const r2 = m2.multiply(m1);

      // Results should be different
      let different = false;
      for (let i = 0; i < 16; i++) {
        if (Math.abs(r1.data[i] - r2.data[i]) > 0.001) {
          different = true;
          break;
        }
      }
      expect(different).toBe(true);
    });
  });

  describe('Inverse', () => {
    test('identity inverse is identity', () => {
      const m = Matrix4.identity();
      const inv = m.inverse();

      for (let i = 0; i < 16; i++) {
        expect(inv.data[i]).toBeCloseTo(m.data[i], 5);
      }
    });

    test('translation inverse', () => {
      const m = Matrix4.translation(1, 2, 3);
      const inv = m.inverse();
      const translation = inv.getTranslation();

      expect(translation[0]).toBeCloseTo(-1, 5);
      expect(translation[1]).toBeCloseTo(-2, 5);
      expect(translation[2]).toBeCloseTo(-3, 5);
    });

    test('M * M^-1 = I', () => {
      const m = Matrix4.translation(1, 2, 3);
      const inv = m.inverse();
      const result = m.multiply(inv);

      const identity = Matrix4.identity();
      for (let i = 0; i < 16; i++) {
        expect(result.data[i]).toBeCloseTo(identity.data[i], 5);
      }
    });
  });

  describe('Clone', () => {
    test('creates independent copy', () => {
      const m1 = Matrix4.translation(1, 2, 3);
      const m2 = m1.clone();

      m2.data[12] = 10;

      expect(m1.data[12]).toBe(1);
      expect(m2.data[12]).toBe(10);
    });
  });

  describe('getTranslation', () => {
    test('extracts translation correctly', () => {
      const m = Matrix4.translation(5, 6, 7);
      const t = m.getTranslation();

      expect(t[0]).toBe(5);
      expect(t[1]).toBe(6);
      expect(t[2]).toBe(7);
    });
  });
});
