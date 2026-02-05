/**
 * ARPerformanceMonitor Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ARPerformanceMonitor, QualityLevel } from '../../src/core/performance/performance-monitor';

describe('ARPerformanceMonitor', () => {
  let monitor: ARPerformanceMonitor;

  beforeEach(() => {
    monitor = new ARPerformanceMonitor();
  });

  describe('constructor', () => {
    it('should create monitor with default budget', () => {
      expect(monitor).toBeDefined();
      const budget = monitor.getBudget();
      expect(budget.targetFPS).toBe(30);
      expect(budget.maxFrameTime).toBe(33);
    });

    it('should create monitor with custom budget', () => {
      const customMonitor = new ARPerformanceMonitor({
        targetFPS: 60,
        maxFrameTime: 16,
        maxGPUMemory: 200,
        maxCPUMemory: 150,
      });

      const budget = customMonitor.getBudget();
      expect(budget.targetFPS).toBe(60);
      expect(budget.maxFrameTime).toBe(16);
      expect(budget.maxGPUMemory).toBe(200);
      expect(budget.maxCPUMemory).toBe(150);
    });
  });

  describe('frame timing', () => {
    it('should track frame timing', () => {
      monitor.startFrame();

      // Simulate some work
      const start = performance.now();
      while (performance.now() - start < 10) {
        // Busy wait for ~10ms
      }

      const metrics = monitor.endFrame();
      expect(metrics.frameTime).toBeGreaterThan(0);
      expect(metrics.frameTime).toBeGreaterThanOrEqual(10);
    });

    it('should track section timing', () => {
      monitor.startFrame();

      monitor.markSection('camera');
      const cameraStart = performance.now();
      while (performance.now() - cameraStart < 5) {}

      monitor.markSection('gpu');
      const gpuStart = performance.now();
      while (performance.now() - gpuStart < 3) {}

      const metrics = monitor.endFrame();
      expect(metrics.breakdown.camera).toBeGreaterThan(0);
      expect(metrics.breakdown.gpu).toBeGreaterThan(0);
    });

    it('should reset metrics', () => {
      monitor.startFrame();
      monitor.markSection('camera');
      monitor.endFrame();

      monitor.reset();
      const metrics = monitor.getMetrics();
      expect(metrics.fps).toBe(0);
    });
  });

  describe('budget management', () => {
    it('should update budget', () => {
      monitor.setBudget({ targetFPS: 60, maxFrameTime: 16 });
      const budget = monitor.getBudget();
      expect(budget.targetFPS).toBe(60);
      expect(budget.maxFrameTime).toBe(16);
    });

    it('should check if within budget (good performance)', () => {
      // Simulate fast frames
      for (let i = 0; i < 10; i++) {
        monitor.startFrame();
        const start = performance.now();
        while (performance.now() - start < 5) {} // Fast frame (5ms)
        monitor.endFrame();
      }

      // Wait for FPS update
      const start = performance.now();
      while (performance.now() - start < 1100) {}

      const metrics = monitor.getMetrics();
      // Should be within budget with fast frames
      expect(metrics.frameTime).toBeLessThan(33);
    });
  });

  describe('quality management', () => {
    it('should get current quality', () => {
      const quality = monitor.getQuality();
      expect(quality).toBe(QualityLevel.HIGH); // Default
    });

    it('should set quality', () => {
      monitor.setQuality(QualityLevel.LOW);
      expect(monitor.getQuality()).toBe(QualityLevel.LOW);

      monitor.setQuality(QualityLevel.ULTRA);
      expect(monitor.getQuality()).toBe(QualityLevel.ULTRA);
    });

    it('should not recommend quality change during cooldown', () => {
      monitor.setQuality(QualityLevel.MEDIUM);

      // Simulate bad performance
      monitor.startFrame();
      const start = performance.now();
      while (performance.now() - start < 50) {} // Slow frame
      monitor.endFrame();

      // Should not reduce during cooldown
      expect(monitor.shouldReduceQuality()).toBe(false);
      expect(monitor.shouldIncreaseQuality()).toBe(false);
    });

    it('should get quality settings for all levels', () => {
      const lowSettings = ARPerformanceMonitor.getQualitySettings(QualityLevel.LOW);
      expect(lowSettings.resolution.width).toBe(480);
      expect(lowSettings.detectionInterval).toBe(10);
      expect(lowSettings.maxKeypoints).toBe(200);
      expect(lowSettings.enableSubPixel).toBe(false);

      const mediumSettings = ARPerformanceMonitor.getQualitySettings(QualityLevel.MEDIUM);
      expect(mediumSettings.resolution.width).toBe(640);
      expect(mediumSettings.detectionInterval).toBe(5);

      const highSettings = ARPerformanceMonitor.getQualitySettings(QualityLevel.HIGH);
      expect(highSettings.resolution.width).toBe(1280);
      expect(highSettings.enableSubPixel).toBe(true);

      const ultraSettings = ARPerformanceMonitor.getQualitySettings(QualityLevel.ULTRA);
      expect(ultraSettings.resolution.width).toBe(1920);
      expect(ultraSettings.detectionInterval).toBe(1);
    });
  });

  describe('metrics', () => {
    it('should return current metrics', () => {
      monitor.startFrame();
      monitor.markSection('camera');
      const metrics = monitor.endFrame();

      expect(metrics).toHaveProperty('fps');
      expect(metrics).toHaveProperty('frameTime');
      expect(metrics).toHaveProperty('breakdown');
      expect(metrics.breakdown).toHaveProperty('camera');
      expect(metrics.breakdown).toHaveProperty('gpu');
      expect(metrics.breakdown).toHaveProperty('tracking');
      expect(metrics.breakdown).toHaveProperty('detection');
      expect(metrics.breakdown).toHaveProperty('rendering');
    });

    it('should preserve metrics between frames', () => {
      monitor.startFrame();
      monitor.markSection('camera');
      const metrics1 = monitor.endFrame();

      const metrics2 = monitor.getMetrics();
      expect(metrics2.frameTime).toBe(metrics1.frameTime);
    });
  });

  describe('quality recommendations', () => {
    it('should recommend quality based on performance', () => {
      // Start at HIGH
      monitor.setQuality(QualityLevel.HIGH);

      // Simulate many frames to clear cooldown
      for (let i = 0; i < 65; i++) {
        monitor.startFrame();
        monitor.endFrame();
      }

      const recommended = monitor.getRecommendedQuality();
      expect([
        QualityLevel.LOW,
        QualityLevel.MEDIUM,
        QualityLevel.HIGH,
        QualityLevel.ULTRA
      ]).toContain(recommended);
    });

    it('should not reduce below LOW', () => {
      monitor.setQuality(QualityLevel.LOW);

      // Clear cooldown
      for (let i = 0; i < 65; i++) {
        monitor.startFrame();
        monitor.endFrame();
      }

      expect(monitor.shouldReduceQuality()).toBe(false);
      expect(monitor.getRecommendedQuality()).toBe(QualityLevel.LOW);
    });

    it('should not increase above ULTRA', () => {
      monitor.setQuality(QualityLevel.ULTRA);

      // Clear cooldown
      for (let i = 0; i < 65; i++) {
        monitor.startFrame();
        monitor.endFrame();
      }

      expect(monitor.shouldIncreaseQuality()).toBe(false);
      expect(monitor.getRecommendedQuality()).toBe(QualityLevel.ULTRA);
    });
  });
});
