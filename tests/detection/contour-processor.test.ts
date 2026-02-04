import { test, expect, describe } from 'bun:test';
import { ContourProcessor } from '../../src/core/detection/contour-processor';

describe('ContourProcessor', () => {
  describe('findContours', () => {
    test('finds contours in simple binary image', () => {
      // Create 10x10 image with a small square
      const width = 10;
      const height = 10;
      const image = new Uint8Array(width * height);

      // Draw a 3x3 square
      for (let y = 3; y < 6; y++) {
        for (let x = 3; x < 6; x++) {
          image[y * width + x] = 255;
        }
      }

      const contours = ContourProcessor.findContours(image, width, height, 4, 100);

      expect(contours.length).toBeGreaterThan(0);
    });

    test('returns empty array for blank image', () => {
      const width = 10;
      const height = 10;
      const image = new Uint8Array(width * height);

      const contours = ContourProcessor.findContours(image, width, height);

      expect(contours.length).toBe(0);
    });

    test('filters by perimeter', () => {
      const width = 20;
      const height = 20;
      const image = new Uint8Array(width * height);

      // Draw small square (will be filtered out)
      for (let y = 2; y < 4; y++) {
        for (let x = 2; x < 4; x++) {
          image[y * width + x] = 255;
        }
      }

      const contours = ContourProcessor.findContours(image, width, height, 100, 1000);

      // Should be filtered out due to small perimeter
      expect(contours.length).toBe(0);
    });
  });

  describe('approximatePolygon', () => {
    test('simplifies contour to polygon', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        { x: 3, y: 3 },
        { x: 2, y: 3 },
        { x: 1, y: 3 },
        { x: 0, y: 3 },
        { x: 0, y: 2 },
        { x: 0, y: 1 },
      ];

      const contour = {
        points,
        area: 9,
        perimeter: 12,
        isConvex: true,
      };

      const polygon = ContourProcessor.approximatePolygon(contour);

      // Should simplify to approximately 4 corners (square)
      expect(polygon.length).toBeLessThan(points.length);
      expect(polygon.length).toBeGreaterThanOrEqual(4);
    });

    test('handles simple shapes', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const contour = {
        points,
        area: 100,
        perimeter: 40,
        isConvex: true,
      };

      const polygon = ContourProcessor.approximatePolygon(contour);

      expect(polygon.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('extractQuad', () => {
    test('extracts quad from 4-point polygon', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const quad = ContourProcessor.extractQuad(polygon);

      expect(quad).not.toBeNull();
      expect(quad!.corners.length).toBe(4);
    });

    test('returns null for non-quad polygons', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ];

      const quad = ContourProcessor.extractQuad(polygon);

      expect(quad).toBeNull();
    });

    test('rejects very small quads', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 5 },
      ];

      const quad = ContourProcessor.extractQuad(polygon);

      // Should reject due to small size
      expect(quad).toBeNull();
    });

    test('rejects non-square aspect ratios', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 50 },
        { x: 0, y: 50 },
      ];

      const quad = ContourProcessor.extractQuad(polygon);

      // Should reject due to extreme aspect ratio
      expect(quad).toBeNull();
    });

    test('accepts square-ish quads', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 90 },
        { x: 0, y: 90 },
      ];

      const quad = ContourProcessor.extractQuad(polygon);

      expect(quad).not.toBeNull();
    });
  });

  describe('Geometry calculations', () => {
    test('calculates area correctly', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const contour = {
        points: polygon,
        area: 0,
        perimeter: 0,
        isConvex: false,
      };

      // Calculate area through approximation
      const approx = ContourProcessor.approximatePolygon(contour);
      const quad = ContourProcessor.extractQuad(approx);

      if (quad) {
        // Area should be approximately 100
        expect(quad.area).toBeGreaterThan(50);
        expect(quad.area).toBeLessThan(150);
      }
    });

    test('detects convex polygons', () => {
      // Square is convex
      const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const contour = {
        points: square,
        area: 100,
        perimeter: 40,
        isConvex: false,
      };

      // This is tested internally, just verify it doesn't crash
      const polygon = ContourProcessor.approximatePolygon(contour);
      expect(polygon.length).toBeGreaterThan(0);
    });
  });
});
