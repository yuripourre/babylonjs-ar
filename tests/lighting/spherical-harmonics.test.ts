/**
 * Spherical Harmonics Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SphericalHarmonics } from '../../src/core/lighting/spherical-harmonics';
import type { SHCoefficients } from '../../src/core/lighting/spherical-harmonics';
import { Vector3 } from '../../src/core/math/vector';
import { createTestImageData } from '../helpers/test-utils';

describe('SphericalHarmonics', () => {
  let sh: SphericalHarmonics;

  beforeEach(() => {
    sh = new SphericalHarmonics();
  });

  describe('coefficient calculation', () => {
    it('should calculate SH coefficients from image', () => {
      const imageData = createTestImageData(64, 64, 'checkerboard');

      const coeffs = sh.calculateFromImage(imageData);

      expect(coeffs).toBeInstanceOf(Float32Array);
      expect(coeffs.length).toBe(27); // 9 coefficients x 3 channels

      // Coefficients should be finite
      for (let i = 0; i < 27; i++) {
        expect(isFinite(coeffs[i])).toBe(true);
      }
    });

    it('should calculate different coeffs for different images', () => {
      const image1 = createTestImageData(64, 64, 'checkerboard');
      const image2 = createTestImageData(64, 64, 'gradient');

      const coeffs1 = sh.calculateFromImage(image1);
      const coeffs2 = sh.calculateFromImage(image2);

      // Coefficients should be different
      let different = false;
      for (let i = 0; i < 27; i++) {
        if (Math.abs(coeffs1[i] - coeffs2[i]) > 0.01) {
          different = true;
          break;
        }
      }

      expect(different).toBe(true);
    });

    it('should handle uniform white image', () => {
      const imageData = createTestImageData(64, 64, 'random');

      // Make all pixels white
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 255;
        imageData.data[i + 1] = 255;
        imageData.data[i + 2] = 255;
      }

      const coeffs = sh.calculateFromImage(imageData);

      // Band 0 should be high (constant term)
      expect(coeffs[0]).toBeGreaterThan(0.5);  // R
      expect(coeffs[9]).toBeGreaterThan(0.5);  // G
      expect(coeffs[18]).toBeGreaterThan(0.5); // B

      // Higher bands should be near zero (no directionality)
      for (let i = 1; i < 9; i++) {
        expect(Math.abs(coeffs[i])).toBeLessThan(0.5);
        expect(Math.abs(coeffs[i + 9])).toBeLessThan(0.5);
        expect(Math.abs(coeffs[i + 18])).toBeLessThan(0.5);
      }
    });
  });

  describe('irradiance evaluation', () => {
    it('should evaluate irradiance for a direction', () => {
      const coeffs = SphericalHarmonics.createDefault();
      const direction = new Vector3(0, 1, 0); // Up

      const irradiance = sh.evaluateIrradiance(coeffs, direction);

      expect(irradiance).toBeDefined();
      expect(irradiance.r).toBeGreaterThan(0);
      expect(irradiance.g).toBeGreaterThan(0);
      expect(irradiance.b).toBeGreaterThan(0);

      // Should be in valid range
      expect(irradiance.r).toBeLessThanOrEqual(1);
      expect(irradiance.g).toBeLessThanOrEqual(1);
      expect(irradiance.b).toBeLessThanOrEqual(1);
    });

    it('should give different irradiance for different directions', () => {
      const coeffs = SphericalHarmonics.createDefault();

      const up = sh.evaluateIrradiance(coeffs, new Vector3(0, 1, 0));
      const down = sh.evaluateIrradiance(coeffs, new Vector3(0, -1, 0));

      // Default lighting is from above, so up should be brighter
      expect(up.r + up.g + up.b).toBeGreaterThan(down.r + down.g + down.b);
    });
  });

  describe('dominant direction', () => {
    it('should extract dominant light direction', () => {
      const coeffs = SphericalHarmonics.createDefault();

      const direction = sh.getDominantDirection(coeffs);

      expect(direction).toBeDefined();
      expect(direction.x).toBeGreaterThan(-1.1);
      expect(direction.x).toBeLessThan(1.1);

      // Should be normalized
      const length = direction.length();
      expect(length).toBeCloseTo(1.0, 1);
    });

    it('should detect upward lighting for default SH', () => {
      const coeffs = SphericalHarmonics.createDefault();
      const direction = sh.getDominantDirection(coeffs);

      // Default lighting is from above, so Y should be positive
      expect(direction.y).toBeGreaterThan(0);
    });
  });

  describe('ambient intensity', () => {
    it('should extract ambient intensity from SH', () => {
      const coeffs = SphericalHarmonics.createDefault();

      const intensity = sh.getAmbientIntensity(coeffs);

      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThanOrEqual(1);
    });

    it('should return higher intensity for brighter SH', () => {
      const bright = SphericalHarmonics.createDefault();
      bright[0] = 1.0;  // R
      bright[9] = 1.0;  // G
      bright[18] = 1.0; // B

      const dark = SphericalHarmonics.createDefault();
      dark[0] = 0.2;
      dark[9] = 0.2;
      dark[18] = 0.2;

      const brightIntensity = sh.getAmbientIntensity(bright);
      const darkIntensity = sh.getAmbientIntensity(dark);

      expect(brightIntensity).toBeGreaterThan(darkIntensity);
    });
  });

  describe('shader format conversion', () => {
    it('should convert SH to shader format', () => {
      const coeffs = SphericalHarmonics.createDefault();

      const shaderFormat = sh.toShaderFormat(coeffs);

      expect(shaderFormat).toBeInstanceOf(Array);
      expect(shaderFormat.length).toBe(9);

      // Each element should be a Vector3
      shaderFormat.forEach(vec => {
        expect(vec).toBeInstanceOf(Vector3);
        expect(isFinite(vec.x)).toBe(true);
        expect(isFinite(vec.y)).toBe(true);
        expect(isFinite(vec.z)).toBe(true);
      });
    });
  });

  describe('interpolation', () => {
    it('should interpolate between SH coefficients', () => {
      const a = new Float32Array(27).fill(0);
      const b = new Float32Array(27).fill(1);

      const mid = sh.lerp(a, b, 0.5);

      expect(mid).toBeInstanceOf(Float32Array);
      expect(mid.length).toBe(27);

      // All values should be approximately 0.5
      for (let i = 0; i < 27; i++) {
        expect(mid[i]).toBeCloseTo(0.5, 5);
      }
    });

    it('should return start value at t=0', () => {
      const a = new Float32Array(27).fill(0.3);
      const b = new Float32Array(27).fill(0.7);

      const result = sh.lerp(a, b, 0);

      for (let i = 0; i < 27; i++) {
        expect(result[i]).toBeCloseTo(0.3, 5);
      }
    });

    it('should return end value at t=1', () => {
      const a = new Float32Array(27).fill(0.3);
      const b = new Float32Array(27).fill(0.7);

      const result = sh.lerp(a, b, 1);

      for (let i = 0; i < 27; i++) {
        expect(result[i]).toBeCloseTo(0.7, 5);
      }
    });
  });

  describe('factory methods', () => {
    it('should create default SH coefficients', () => {
      const coeffs = SphericalHarmonics.createDefault();

      expect(coeffs).toBeInstanceOf(Float32Array);
      expect(coeffs.length).toBe(27);

      // Should have reasonable values
      expect(coeffs[0]).toBeGreaterThan(0); // R band 0
      expect(coeffs[9]).toBeGreaterThan(0); // G band 0
      expect(coeffs[18]).toBeGreaterThan(0); // B band 0
    });

    it('should create directional SH coefficients', () => {
      const direction = new Vector3(0, 1, 0); // Up
      const color = { r: 1, g: 0.8, b: 0.6 };
      const intensity = 1.0;

      const coeffs = SphericalHarmonics.createDirectional(
        direction,
        color,
        intensity
      );

      expect(coeffs).toBeInstanceOf(Float32Array);
      expect(coeffs.length).toBe(27);

      // Should have non-zero values
      let hasNonZero = false;
      for (let i = 0; i < 27; i++) {
        if (Math.abs(coeffs[i]) > 0.001) {
          hasNonZero = true;
          break;
        }
      }
      expect(hasNonZero).toBe(true);
    });

    it('should respect color in directional SH', () => {
      const direction = new Vector3(0, 1, 0);
      const red = { r: 1, g: 0, b: 0 };
      const intensity = 1.0;

      const coeffs = SphericalHarmonics.createDirectional(
        direction,
        red,
        intensity
      );

      // Red channel should have higher values than green/blue
      let redSum = 0, greenSum = 0, blueSum = 0;
      for (let i = 0; i < 9; i++) {
        redSum += Math.abs(coeffs[i]);
        greenSum += Math.abs(coeffs[i + 9]);
        blueSum += Math.abs(coeffs[i + 18]);
      }

      expect(redSum).toBeGreaterThan(greenSum);
      expect(redSum).toBeGreaterThan(blueSum);
    });
  });

  describe('rotation', () => {
    it('should rotate SH coefficients', () => {
      const coeffs = SphericalHarmonics.createDefault();

      // Identity rotation matrix
      const identity = new Float32Array([
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ]);

      const rotated = sh.rotate(coeffs, identity);

      // Should be unchanged with identity rotation
      for (let i = 0; i < 27; i++) {
        expect(rotated[i]).toBeCloseTo(coeffs[i], 5);
      }
    });

    it('should preserve band 0 during rotation', () => {
      const coeffs = SphericalHarmonics.createDefault();

      // 90 degree rotation around Y
      const rotation = new Float32Array([
        0, 0, 1,
        0, 1, 0,
        -1, 0, 0,
      ]);

      const rotated = sh.rotate(coeffs, rotation);

      // Band 0 (DC component) should be unchanged
      expect(rotated[0]).toBeCloseTo(coeffs[0], 5);
      expect(rotated[9]).toBeCloseTo(coeffs[9], 5);
      expect(rotated[18]).toBeCloseTo(coeffs[18], 5);
    });
  });
});
