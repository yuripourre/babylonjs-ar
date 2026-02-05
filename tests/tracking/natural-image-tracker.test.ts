/**
 * Natural Image Tracking Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  NaturalImageTracker,
  ReferenceImageStore,
  GeometricVerifier,
} from '../../src/core/tracking/natural-image';
import type { FeatureMatch } from '../../src/core/matching';
import type { Keypoint } from '../../src/core/detection/feature-detector';

describe('ReferenceImageStore', () => {
  let store: ReferenceImageStore;

  beforeEach(() => {
    store = new ReferenceImageStore();
  });

  describe('initialization', () => {
    it('should create empty store', () => {
      expect(store.getCount()).toBe(0);
      expect(store.getAllImages()).toHaveLength(0);
    });
  });

  describe('adding images', () => {
    it('should add reference image', async () => {
      const imageData = new ImageData(100, 100);

      await store.addImage({
        id: 'test-image',
        imageData,
        physicalWidth: 0.2,
      });

      expect(store.getCount()).toBe(1);
      const image = store.getImage('test-image');
      expect(image).toBeDefined();
      expect(image?.id).toBe('test-image');
      expect(image?.width).toBe(100);
      expect(image?.height).toBe(100);
      expect(image?.physicalWidth).toBe(0.2);
    });

    it('should create pyramid for image', async () => {
      const imageData = new ImageData(640, 480);

      await store.addImage({
        id: 'pyramid-test',
        imageData,
      });

      const image = store.getImage('pyramid-test');
      expect(image?.pyramid.levels.length).toBeGreaterThan(1);
      expect(image?.pyramid.levels[0].width).toBe(640);
      expect(image?.pyramid.levels[0].height).toBe(480);

      // Check pyramid scaling
      const level1 = image?.pyramid.levels[1];
      expect(level1).toBeDefined();
      if (level1) {
        expect(level1.width).toBeLessThan(640);
        expect(level1.height).toBeLessThan(480);
      }
    });

    it('should use default physical size if not provided', async () => {
      const imageData = new ImageData(100, 100);

      await store.addImage({
        id: 'default-size',
        imageData,
      });

      const image = store.getImage('default-size');
      expect(image?.physicalWidth).toBe(0.1); // Default 10cm
    });

    it('should add multiple images', async () => {
      await store.addImage({ id: 'img1', imageData: new ImageData(50, 50) });
      await store.addImage({ id: 'img2', imageData: new ImageData(100, 100) });
      await store.addImage({ id: 'img3', imageData: new ImageData(200, 200) });

      expect(store.getCount()).toBe(3);
      expect(store.getAllImages()).toHaveLength(3);
    });
  });

  describe('removing images', () => {
    beforeEach(async () => {
      await store.addImage({ id: 'remove-test', imageData: new ImageData(50, 50) });
    });

    it('should remove image by id', () => {
      const removed = store.removeImage('remove-test');
      expect(removed).toBe(true);
      expect(store.getCount()).toBe(0);
      expect(store.getImage('remove-test')).toBeUndefined();
    });

    it('should return false when removing non-existent image', () => {
      const removed = store.removeImage('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('querying images', () => {
    beforeEach(async () => {
      await store.addImage({ id: 'query1', imageData: new ImageData(100, 100) });
      await store.addImage({ id: 'query2', imageData: new ImageData(200, 200) });
    });

    it('should get image by id', () => {
      const image = store.getImage('query1');
      expect(image).toBeDefined();
      expect(image?.id).toBe('query1');
    });

    it('should return undefined for non-existent id', () => {
      const image = store.getImage('non-existent');
      expect(image).toBeUndefined();
    });

    it('should get all images', () => {
      const images = store.getAllImages();
      expect(images).toHaveLength(2);
      expect(images.map(img => img.id)).toContain('query1');
      expect(images.map(img => img.id)).toContain('query2');
    });

    it('should clear all images', () => {
      store.clear();
      expect(store.getCount()).toBe(0);
      expect(store.getAllImages()).toHaveLength(0);
    });
  });

  describe('pyramid generation', () => {
    it('should stop pyramid at minimum size', async () => {
      // Small image should generate fewer pyramid levels
      const smallImage = new ImageData(50, 50);

      await store.addImage({
        id: 'small',
        imageData: smallImage,
      });

      const image = store.getImage('small');
      expect(image?.pyramid.levels.length).toBeLessThan(8);

      // Last level should be >= 32x32
      const lastLevel = image?.pyramid.levels[image.pyramid.levels.length - 1];
      expect(lastLevel?.width).toBeGreaterThanOrEqual(32);
      expect(lastLevel?.height).toBeGreaterThanOrEqual(32);
    });

    it('should generate correct scales', async () => {
      const imageData = new ImageData(640, 480);

      await store.addImage({
        id: 'scales-test',
        imageData,
      });

      const image = store.getImage('scales-test');
      expect(image?.pyramid.scales[0]).toBe(1.0);

      // Each scale should be ~0.8 of previous
      for (let i = 1; i < image!.pyramid.scales.length; i++) {
        const ratio = image!.pyramid.scales[i] / image!.pyramid.scales[i - 1];
        expect(ratio).toBeCloseTo(0.8, 2);
      }
    });
  });
});

describe('GeometricVerifier', () => {
  let verifier: GeometricVerifier;

  beforeEach(() => {
    verifier = new GeometricVerifier({
      maxIterations: 100,
      threshold: 3.0,
      minInliers: 8,
    });
  });

  describe('initialization', () => {
    it('should create verifier with default config', () => {
      const defaultVerifier = new GeometricVerifier();
      expect(defaultVerifier).toBeDefined();
    });

    it('should create verifier with custom config', () => {
      const customVerifier = new GeometricVerifier({
        maxIterations: 500,
        threshold: 5.0,
        minInliers: 10,
        confidence: 0.95,
      });
      expect(customVerifier).toBeDefined();
    });
  });

  describe('fundamental matrix estimation', () => {
    it('should require minimum number of matches', () => {
      const matches: FeatureMatch[] = [
        { queryIdx: 0, trainIdx: 0, distance: 10 },
        { queryIdx: 1, trainIdx: 1, distance: 15 },
      ];

      const keypoints: Keypoint[] = [
        { x: 10, y: 20, angle: 0, response: 1, octave: 0 },
        { x: 30, y: 40, angle: 0, response: 1, octave: 0 },
      ];

      const result = verifier.estimateFundamentalMatrix(matches, keypoints, keypoints);
      expect(result).toBeNull(); // Not enough matches
    });

    it('should estimate fundamental matrix with sufficient matches', () => {
      // Create synthetic matches with geometric relationship
      const matches: FeatureMatch[] = [];
      const queryKeypoints: Keypoint[] = [];
      const trainKeypoints: Keypoint[] = [];

      for (let i = 0; i < 20; i++) {
        const x = Math.random() * 100;
        const y = Math.random() * 100;

        matches.push({ queryIdx: i, trainIdx: i, distance: 10 });
        queryKeypoints.push({ x, y, angle: 0, response: 1, octave: 0 });
        trainKeypoints.push({
          x: x + Math.random() * 10 - 5, // Add noise
          y: y + Math.random() * 10 - 5,
          angle: 0,
          response: 1,
          octave: 0,
        });
      }

      const result = verifier.estimateFundamentalMatrix(matches, queryKeypoints, trainKeypoints);
      expect(result).not.toBeNull();

      if (result) {
        expect(result.fundamentalMatrix).toBeDefined();
        expect(result.inliers.length).toBeGreaterThan(0);
        expect(result.inlierRatio).toBeGreaterThan(0);
        expect(result.inlierRatio).toBeLessThanOrEqual(1);
      }
    });

    it('should reject outliers', () => {
      const matches: FeatureMatch[] = [];
      const queryKeypoints: Keypoint[] = [];
      const trainKeypoints: Keypoint[] = [];

      // Good matches
      for (let i = 0; i < 15; i++) {
        const x = i * 10;
        const y = i * 10;

        matches.push({ queryIdx: i, trainIdx: i, distance: 10 });
        queryKeypoints.push({ x, y, angle: 0, response: 1, octave: 0 });
        trainKeypoints.push({ x: x + 1, y: y + 1, angle: 0, response: 1, octave: 0 });
      }

      // Add outliers
      for (let i = 15; i < 20; i++) {
        matches.push({ queryIdx: i, trainIdx: i, distance: 50 });
        queryKeypoints.push({ x: i * 10, y: i * 10, angle: 0, response: 1, octave: 0 });
        trainKeypoints.push({
          x: Math.random() * 200,
          y: Math.random() * 200,
          angle: 0,
          response: 1,
          octave: 0,
        });
      }

      const result = verifier.estimateFundamentalMatrix(matches, queryKeypoints, trainKeypoints);
      expect(result).not.toBeNull();

      if (result) {
        // Should have filtered out outliers
        expect(result.inliers.length).toBeLessThan(matches.length);
        expect(result.inliers.length).toBeGreaterThanOrEqual(8);
      }
    });
  });
});

describe('NaturalImageTracker', () => {
  let tracker: NaturalImageTracker;

  beforeEach(() => {
    tracker = new NaturalImageTracker({
      maxImages: 5,
      minMatchCount: 15,
      detectionInterval: 5,
    });
  });

  describe('initialization', () => {
    it('should create tracker with default config', () => {
      const defaultTracker = new NaturalImageTracker();
      expect(defaultTracker).toBeDefined();
    });

    it('should create tracker with custom config', () => {
      expect(tracker).toBeDefined();
    });
  });

  describe('reference image management', () => {
    it('should add reference image', async () => {
      const imageData = new ImageData(100, 100);

      await tracker.addReferenceImage({
        id: 'tracker-test',
        imageData,
        physicalWidth: 0.2,
      });

      const store = tracker.getReferenceStore();
      expect(store.getCount()).toBe(1);
    });

    it('should remove reference image', async () => {
      await tracker.addReferenceImage({
        id: 'remove-tracker-test',
        imageData: new ImageData(100, 100),
      });

      tracker.removeReferenceImage('remove-tracker-test');

      const store = tracker.getReferenceStore();
      expect(store.getCount()).toBe(0);
    });

    it('should respect max images limit', async () => {
      // Add up to max
      for (let i = 0; i < 5; i++) {
        await tracker.addReferenceImage({
          id: `img-${i}`,
          imageData: new ImageData(50, 50),
        });
      }

      const store = tracker.getReferenceStore();
      expect(store.getCount()).toBe(5);

      // Try to add one more
      await tracker.addReferenceImage({
        id: 'img-6',
        imageData: new ImageData(50, 50),
      });

      // Should still be at max
      expect(store.getCount()).toBe(5);
    });
  });

  describe('tracking', () => {
    beforeEach(async () => {
      await tracker.addReferenceImage({
        id: 'track-test',
        imageData: new ImageData(100, 100),
        physicalWidth: 0.3,
      });
    });

    it('should get tracked images', () => {
      const tracked = tracker.getTrackedImages();
      expect(tracked).toBeInstanceOf(Array);
    });

    it('should get specific tracked image', () => {
      const image = tracker.getTrackedImage('track-test');
      expect(image).toBeUndefined(); // Not tracking yet
    });

    it('should create mock tracked image', () => {
      const mockImage = tracker.createMockTrackedImage('track-test', {
        fx: 500,
        fy: 500,
        cx: 320,
        cy: 240,
      });

      expect(mockImage).toBeDefined();
      expect(mockImage.id).toBe('track-test');
      expect(mockImage.pose).toBeDefined();
      expect(mockImage.pose.position).toBeDefined();
      expect(mockImage.pose.rotation).toBeDefined();
      expect(mockImage.pose.matrix).toBeDefined();
      expect(mockImage.confidence).toBeGreaterThan(0);
      expect(mockImage.confidence).toBeLessThanOrEqual(1);
      expect(mockImage.isTracking).toBe(true);
    });

    it('should update tracking state', () => {
      const mockImage = tracker.createMockTrackedImage('track-test', {
        fx: 500,
        fy: 500,
        cx: 320,
        cy: 240,
      });

      tracker.updateTracking('track-test', mockImage);

      const tracked = tracker.getTrackedImage('track-test');
      expect(tracked).toBeDefined();
      expect(tracked?.id).toBe('track-test');
    });

    it('should clear tracking', () => {
      const mockImage = tracker.createMockTrackedImage('track-test', {
        fx: 500,
        fy: 500,
        cx: 320,
        cy: 240,
      });

      tracker.updateTracking('track-test', mockImage);
      tracker.clearTracking('track-test');

      const tracked = tracker.getTrackedImage('track-test');
      expect(tracked).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should destroy tracker', async () => {
      await tracker.addReferenceImage({
        id: 'destroy-test',
        imageData: new ImageData(100, 100),
      });

      tracker.destroy();

      const store = tracker.getReferenceStore();
      expect(store.getCount()).toBe(0);
      expect(tracker.getTrackedImages()).toHaveLength(0);
    });
  });
});
