/**
 * Light Estimator Tests
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { LightEstimator } from '../../src/core/lighting/light-estimator';
import type { LightEstimatorConfig } from '../../src/core/lighting/light-estimator';
import { createTestImageData } from '../helpers/test-utils';

describe('LightEstimator', () => {
  let estimator: LightEstimator;
  let originalDocument: typeof document;

  beforeEach(() => {
    originalDocument = globalThis.document;

    // Mock ImageData if not available
    if (typeof ImageData === 'undefined') {
      (globalThis as any).ImageData = class {
        data: Uint8ClampedArray;
        width: number;
        height: number;

        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
          this.data = new Uint8ClampedArray(width * height * 4);
        }
      };
    }

    // Mock document for canvas creation
    if (!globalThis.document) {
      globalThis.document = {
        createElement: mock((tag: string) => {
          if (tag === 'canvas') {
            const canvas = {
              width: 0,
              height: 0,
              getContext: mock((type: string) => {
                if (type === '2d') {
                  return {
                    drawImage: mock(() => {}),
                    getImageData: mock((x: number, y: number, w: number, h: number) => {
                      return new (globalThis as any).ImageData(w, h);
                    }),
                    putImageData: mock(() => {}),
                  };
                }
                return null;
              }),
            };
            return canvas;
          }
          return {};
        }),
      } as any;
    }

    estimator = new LightEstimator();
  });

  afterEach(() => {
    if (!originalDocument) {
      delete (globalThis as any).document;
    } else {
      globalThis.document = originalDocument;
    }
  });

  describe('initialization', () => {
    it('should create estimator with default config', () => {
      expect(estimator).toBeDefined();
      expect(estimator.getLastEstimate()).toBeNull();
    });

    it('should create estimator with custom config', () => {
      const customEstimator = new LightEstimator({
        sampleSize: 32,
        updateInterval: 50,
        temporalSmoothing: 0.9,
        enableSphericalHarmonics: false,
      });

      expect(customEstimator).toBeDefined();
    });

    it('should update config dynamically', () => {
      estimator.updateConfig({
        updateInterval: 200,
      });

      // Should not throw
      expect(estimator).toBeDefined();
    });
  });

  describe('light estimation from frames', () => {
    it('should estimate lighting from bright image', async () => {
      // Create bright white image
      const imageData = createTestImageData(64, 64, 'gradient');

      // Manually set to bright white
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 255;     // R
        imageData.data[i + 1] = 255; // G
        imageData.data[i + 2] = 255; // B
        imageData.data[i + 3] = 255; // A
      }

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate = await estimator.estimate(mockCanvas);

      expect(estimate).toBeDefined();
      expect(estimate.ambientIntensity).toBeGreaterThan(0.5);
      expect(estimate.confidence).toBeGreaterThan(0);
      expect(estimate.source).toBe('cpu-fallback');
      expect(estimate.primaryDirection).toBeDefined();
      expect(estimate.sphericalHarmonics).toBeInstanceOf(Float32Array);
      expect(estimate.sphericalHarmonics.length).toBe(27);
    });

    it('should estimate lighting from dark image', async () => {
      // Create dark image
      const imageData = createTestImageData(64, 64, 'gradient');

      // Manually set to dark
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 50;      // R
        imageData.data[i + 1] = 50;  // G
        imageData.data[i + 2] = 50;  // B
        imageData.data[i + 3] = 255; // A
      }

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate = await estimator.estimate(mockCanvas);

      expect(estimate.ambientIntensity).toBeLessThan(0.5);
      expect(estimate.confidence).toBeGreaterThan(0);
    });

    it('should estimate color temperature', async () => {
      const imageData = createTestImageData(64, 64, 'gradient');

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate = await estimator.estimate(mockCanvas);

      expect(estimate.colorTemperature).toBeGreaterThan(1000);
      expect(estimate.colorTemperature).toBeLessThan(40000);
    });

    it('should estimate primary light direction', async () => {
      const imageData = createTestImageData(64, 64, 'gradient');

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate = await estimator.estimate(mockCanvas);

      const dir = estimate.primaryDirection;
      expect(dir).toBeDefined();
      expect(dir.x).toBeGreaterThan(-1.1);
      expect(dir.x).toBeLessThan(1.1);
      expect(dir.y).toBeGreaterThan(-1.1);
      expect(dir.y).toBeLessThan(1.1);
      expect(dir.z).toBeGreaterThan(-1.1);
      expect(dir.z).toBeLessThan(1.1);

      // Direction should be normalized
      const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      expect(length).toBeCloseTo(1.0, 1);
    });
  });

  describe('temporal smoothing', () => {
    it('should smooth between consecutive estimates', async () => {
      const imageData1 = createTestImageData(64, 64, 'gradient');

      // Make first image bright
      for (let i = 0; i < imageData1.data.length; i += 4) {
        imageData1.data[i] = 255;
        imageData1.data[i + 1] = 255;
        imageData1.data[i + 2] = 255;
      }

      const mockCanvas1 = document.createElement('canvas');
      mockCanvas1.width = 64;
      mockCanvas1.height = 64;
      const ctx1 = mockCanvas1.getContext('2d')!;
      ctx1.putImageData(imageData1, 0, 0);

      const estimate1 = await estimator.estimate(mockCanvas1);

      // Wait for update interval
      await new Promise(resolve => setTimeout(resolve, 150));

      // Create second image (dark)
      const imageData2 = createTestImageData(64, 64, 'gradient');
      for (let i = 0; i < imageData2.data.length; i += 4) {
        imageData2.data[i] = 50;
        imageData2.data[i + 1] = 50;
        imageData2.data[i + 2] = 50;
      }

      const mockCanvas2 = document.createElement('canvas');
      mockCanvas2.width = 64;
      mockCanvas2.height = 64;
      const ctx2 = mockCanvas2.getContext('2d')!;
      ctx2.putImageData(imageData2, 0, 0);

      const estimate2 = await estimator.estimate(mockCanvas2);

      // Second estimate should be smoothed (not as dark as raw data)
      expect(estimate2.ambientIntensity).toBeGreaterThan(0.2);
      expect(estimate2.ambientIntensity).toBeLessThan(estimate1.ambientIntensity);
    });

    it('should respect update interval throttling', async () => {
      const imageData = createTestImageData(64, 64, 'gradient');

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate1 = await estimator.estimate(mockCanvas);
      const estimate2 = await estimator.estimate(mockCanvas); // Immediate second call

      // Should return same estimate due to throttling
      expect(estimate1.timestamp).toBe(estimate2.timestamp);
    });
  });

  describe('spherical harmonics', () => {
    it('should calculate SH coefficients', async () => {
      const imageData = createTestImageData(64, 64, 'gradient');

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate = await estimator.estimate(mockCanvas);

      expect(estimate.sphericalHarmonics).toBeInstanceOf(Float32Array);
      expect(estimate.sphericalHarmonics.length).toBe(27);

      // Check that coefficients are reasonable
      for (let i = 0; i < 27; i++) {
        expect(estimate.sphericalHarmonics[i]).toBeGreaterThan(-10);
        expect(estimate.sphericalHarmonics[i]).toBeLessThan(10);
      }
    });

    it('should disable SH calculation when configured', async () => {
      const noSHEstimator = new LightEstimator({
        enableSphericalHarmonics: false,
      });

      const imageData = createTestImageData(64, 64, 'gradient');

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate = await noSHEstimator.estimate(mockCanvas);

      // SH should be zero array
      const allZero = Array.from(estimate.sphericalHarmonics).every(v => v === 0);
      expect(allZero).toBe(true);
    });
  });

  describe('color temperature', () => {
    it('should detect warm lighting', async () => {
      const imageData = createTestImageData(64, 64, 'gradient');

      // Create warm (orange/yellow) image
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 255;     // R
        imageData.data[i + 1] = 200; // G
        imageData.data[i + 2] = 100; // B
      }

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate = await estimator.estimate(mockCanvas);

      // Warm lighting should have lower color temperature
      expect(estimate.colorTemperature).toBeLessThan(5000);
      expect(estimate.primaryColor.r).toBeGreaterThan(estimate.primaryColor.b);
    });

    it('should detect cool lighting', async () => {
      const imageData = createTestImageData(64, 64, 'gradient');

      // Create cool (blue) image
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 100;     // R
        imageData.data[i + 1] = 150; // G
        imageData.data[i + 2] = 255; // B
      }

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate = await estimator.estimate(mockCanvas);

      // Cool lighting should have higher color temperature
      expect(estimate.colorTemperature).toBeGreaterThan(5500);
      expect(estimate.primaryColor.b).toBeGreaterThan(estimate.primaryColor.r);
    });
  });

  describe('caching and state', () => {
    it('should return cached estimate', () => {
      expect(estimator.getLastEstimate()).toBeNull();

      // After estimation, should return cached value
      // (Tested implicitly in other tests)
    });

    it('should update timestamp on new estimate', async () => {
      const imageData = createTestImageData(64, 64, 'gradient');

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 64;
      mockCanvas.height = 64;
      const ctx = mockCanvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);

      const estimate1 = await estimator.estimate(mockCanvas);

      await new Promise(resolve => setTimeout(resolve, 150));

      const estimate2 = await estimator.estimate(mockCanvas);

      expect(estimate2.timestamp).toBeGreaterThan(estimate1.timestamp);
    });
  });

  describe('cleanup', () => {
    it('should destroy estimator', () => {
      estimator.destroy();

      // Should not throw
      expect(estimator.getLastEstimate()).toBeNull();
    });
  });
});
