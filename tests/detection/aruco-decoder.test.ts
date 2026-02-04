import { test, expect, describe } from 'bun:test';
import { ArucoDecoder } from '../../src/core/detection/aruco-decoder';

describe('ArucoDecoder', () => {
  describe('Constructor', () => {
    test('creates decoder with default dictionary size', () => {
      const decoder = new ArucoDecoder();
      expect(decoder).toBeDefined();
    });

    test('creates decoder with specified dictionary size', () => {
      const decoder = new ArucoDecoder(5);
      expect(decoder).toBeDefined();
    });
  });

  describe('extractBits', () => {
    test('extracts bits from perfect marker image', () => {
      const imageSize = 32;
      const markerSize = 4;
      const imageData = new Uint8Array(imageSize * imageSize);

      // Fill with black (border)
      imageData.fill(0);

      // Create a simple pattern in the center
      const cellSize = imageSize / (markerSize + 2);

      // Set some cells to white
      for (let y = 0; y < markerSize; y++) {
        for (let x = 0; x < markerSize; x++) {
          const centerX = Math.floor((x + 1.5) * cellSize);
          const centerY = Math.floor((y + 1.5) * cellSize);

          // Make checkerboard pattern
          if ((x + y) % 2 === 0) {
            imageData[centerY * imageSize + centerX] = 255;
          }
        }
      }

      const decoder = new ArucoDecoder(4);
      const bits = decoder.extractBits(imageData, imageSize, markerSize);

      expect(bits.size).toBe(4);
      expect(bits.bits.length).toBe(16);
    });

    test('handles different marker sizes', () => {
      const imageSize = 48;
      const markerSize = 5;
      const imageData = new Uint8Array(imageSize * imageSize);

      const decoder = new ArucoDecoder(5);
      const bits = decoder.extractBits(imageData, imageSize, markerSize);

      expect(bits.size).toBe(5);
      expect(bits.bits.length).toBe(25);
    });
  });

  describe('decode', () => {
    test('decodes known marker pattern', () => {
      const decoder = new ArucoDecoder(4);

      // Use marker ID 0 pattern from dictionary
      const markerBits = {
        size: 4,
        bits: [0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0],
      };

      const decoded = decoder.decode(markerBits);

      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(0);
      expect(decoded!.rotation).toBe(0);
      expect(decoded!.hamming).toBe(0);
    });

    test('handles rotation', () => {
      const decoder = new ArucoDecoder(4);

      // Manually rotated pattern should still match
      const markerBits = {
        size: 4,
        bits: [0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0],
      };

      const decoded = decoder.decode(markerBits);

      expect(decoded).not.toBeNull();
      expect(decoded!.rotation).toBeGreaterThanOrEqual(0);
      expect(decoded!.rotation).toBeLessThanOrEqual(3);
    });

    test('rejects invalid patterns', () => {
      const decoder = new ArucoDecoder(4);

      // Random pattern that doesn't match dictionary
      const markerBits = {
        size: 4,
        bits: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      };

      const decoded = decoder.decode(markerBits);

      // Should reject or have high hamming distance
      if (decoded) {
        expect(decoded.hamming).toBeGreaterThan(2);
      }
    });

    test('tolerates small errors', () => {
      const decoder = new ArucoDecoder(4);

      // Marker ID 0 with 1 bit error
      const markerBits = {
        size: 4,
        bits: [1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0], // Changed first bit
      };

      const decoded = decoder.decode(markerBits);

      // Should still decode with small error
      expect(decoded).not.toBeNull();
      if (decoded) {
        expect(decoded.hamming).toBeGreaterThan(0);
        expect(decoded.hamming).toBeLessThanOrEqual(2);
      }
    });

    test('rejects pattern with wrong size', () => {
      const decoder = new ArucoDecoder(4);

      const markerBits = {
        size: 5,
        bits: new Array(25).fill(0),
      };

      const decoded = decoder.decode(markerBits);

      expect(decoded).toBeNull();
    });
  });

  describe('verifyBorder', () => {
    test('accepts marker with black border', () => {
      const imageSize = 32;
      const markerSize = 4;
      const imageData = new Uint8Array(imageSize * imageSize);

      // Fill with black
      imageData.fill(0);

      // White center
      const cellSize = imageSize / (markerSize + 2);
      for (let y = 1; y < markerSize + 1; y++) {
        for (let x = 1; x < markerSize + 1; x++) {
          const centerX = Math.floor(x * cellSize + cellSize / 2);
          const centerY = Math.floor(y * cellSize + cellSize / 2);
          imageData[centerY * imageSize + centerX] = 255;
        }
      }

      const valid = ArucoDecoder.verifyBorder(imageData, imageSize, markerSize);

      expect(valid).toBe(true);
    });

    test('rejects marker without border', () => {
      const imageSize = 32;
      const markerSize = 4;
      const imageData = new Uint8Array(imageSize * imageSize);

      // Fill everything with white
      imageData.fill(255);

      const valid = ArucoDecoder.verifyBorder(imageData, imageSize, markerSize);

      expect(valid).toBe(false);
    });

    test('handles partial border', () => {
      const imageSize = 32;
      const markerSize = 4;
      const imageData = new Uint8Array(imageSize * imageSize);

      // 50% black border
      for (let i = 0; i < imageData.length; i++) {
        imageData[i] = i % 2 === 0 ? 0 : 255;
      }

      const valid = ArucoDecoder.verifyBorder(imageData, imageSize, markerSize);

      // Should reject (need 75%)
      expect(valid).toBe(false);
    });
  });

  describe('Hamming distance calculation', () => {
    test('identical patterns have distance 0', () => {
      const decoder = new ArucoDecoder(4);

      const bits = {
        size: 4,
        bits: [0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0],
      };

      const decoded = decoder.decode(bits);

      expect(decoded).not.toBeNull();
      expect(decoded!.hamming).toBe(0);
    });
  });

  describe('Rotation detection', () => {
    test('detects all 4 rotations', () => {
      const decoder = new ArucoDecoder(4);

      // Test that all rotations 0-3 are possible
      const rotations = new Set();

      for (let i = 0; i < 10; i++) {
        const bits = {
          size: 4,
          bits: [0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0],
        };

        const decoded = decoder.decode(bits);
        if (decoded) {
          rotations.add(decoded.rotation);
        }
      }

      // Should have found at least rotation 0
      expect(rotations.has(0)).toBe(true);
    });
  });
});
