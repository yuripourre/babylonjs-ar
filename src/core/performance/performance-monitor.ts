/**
 * Performance Monitor
 * Real-time profiling with adaptive quality for mobile optimization
 *
 * Features:
 * - Frame timing breakdown
 * - Memory usage tracking
 * - FPS monitoring
 * - Adaptive quality recommendations
 * - Performance budget enforcement
 */

import { Logger } from '../../utils/logger';

const log = Logger.create('PerformanceMonitor');

export interface PerformanceMetrics {
  fps: number;
  frameTime: number; // ms
  breakdown: {
    camera: number;
    gpu: number;
    tracking: number;
    detection: number;
    rendering: number;
  };
  memoryUsage?: {
    gpu: number; // MB
    cpu: number; // MB
  };
}

export interface PerformanceBudget {
  targetFPS: number;
  maxFrameTime: number; // ms
  maxGPUMemory: number; // MB
  maxCPUMemory: number; // MB
}

export enum QualityLevel {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  ULTRA = 3,
}

export interface ARQualitySettings {
  level: QualityLevel;
  resolution: { width: number; height: number };
  detectionInterval: number; // Frames between detection
  maxKeypoints: number;
  enableSubPixel: boolean;
  enableTemporalFilter: boolean;
}

export class ARPerformanceMonitor {
  private budget: PerformanceBudget;
  private metrics: PerformanceMetrics;
  private currentQuality: QualityLevel;

  // Timing
  private frameStartTime = 0;
  private sectionStartTime = 0;
  private currentSection: string = '';
  private sectionTimes: Map<string, number> = new Map();

  // FPS tracking
  private frameCount = 0;
  private lastFPSUpdate = 0;
  private fpsHistory: number[] = [];

  // Quality adjustment
  private qualityAdjustmentCooldown = 0;
  private readonly COOLDOWN_FRAMES = 60; // Wait 60 frames between adjustments

  constructor(budget?: Partial<PerformanceBudget>) {
    this.budget = {
      targetFPS: budget?.targetFPS ?? 30,
      maxFrameTime: budget?.maxFrameTime ?? 33, // 30fps = 33ms
      maxGPUMemory: budget?.maxGPUMemory ?? 150,
      maxCPUMemory: budget?.maxCPUMemory ?? 100,
    };

    this.metrics = {
      fps: 0,
      frameTime: 0,
      breakdown: {
        camera: 0,
        gpu: 0,
        tracking: 0,
        detection: 0,
        rendering: 0,
      },
    };

    this.currentQuality = QualityLevel.HIGH;

    log.info(`Performance monitor initialized with ${this.budget.targetFPS}fps target`);
  }

  /**
   * Start frame timing
   */
  startFrame(): void {
    this.frameStartTime = performance.now();
    this.sectionTimes.clear();
  }

  /**
   * End frame timing and compute metrics
   */
  endFrame(): PerformanceMetrics {
    const frameEnd = performance.now();
    const frameTime = frameEnd - this.frameStartTime;

    // Update metrics
    this.metrics.frameTime = frameTime;
    this.metrics.breakdown = {
      camera: this.sectionTimes.get('camera') ?? 0,
      gpu: this.sectionTimes.get('gpu') ?? 0,
      tracking: this.sectionTimes.get('tracking') ?? 0,
      detection: this.sectionTimes.get('detection') ?? 0,
      rendering: this.sectionTimes.get('rendering') ?? 0,
    };

    // Update FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFPSUpdate >= 1000) {
      this.metrics.fps = Math.round(
        (this.frameCount * 1000) / (now - this.lastFPSUpdate)
      );
      this.fpsHistory.push(this.metrics.fps);
      if (this.fpsHistory.length > 10) {
        this.fpsHistory.shift();
      }
      this.frameCount = 0;
      this.lastFPSUpdate = now;
    }

    // Update memory if available
    if ((performance as any).memory) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = {
        gpu: 0, // Would need WebGPU memory query
        cpu: memory.usedJSHeapSize / (1024 * 1024),
      };
    }

    // Cooldown adjustment timer
    if (this.qualityAdjustmentCooldown > 0) {
      this.qualityAdjustmentCooldown--;
    }

    return { ...this.metrics };
  }

  /**
   * Mark start of a section
   */
  markSection(name: string): void {
    // End previous section
    if (this.currentSection) {
      const elapsed = performance.now() - this.sectionStartTime;
      this.sectionTimes.set(this.currentSection, elapsed);
    }

    // Start new section
    this.currentSection = name;
    this.sectionStartTime = performance.now();
  }

  /**
   * Set performance budget
   */
  setBudget(budget: Partial<PerformanceBudget>): void {
    this.budget = { ...this.budget, ...budget };
    log.info(`Budget updated: ${this.budget.targetFPS}fps target`);
  }

  /**
   * Get current budget
   */
  getBudget(): PerformanceBudget {
    return { ...this.budget };
  }

  /**
   * Check if within performance budget
   */
  isWithinBudget(): boolean {
    const fpsOK = this.metrics.fps >= this.budget.targetFPS * 0.9; // 90% tolerance
    const frameTimeOK = this.metrics.frameTime <= this.budget.maxFrameTime * 1.1; // 110% tolerance

    let memoryOK = true;
    if (this.metrics.memoryUsage) {
      memoryOK =
        this.metrics.memoryUsage.cpu <= this.budget.maxCPUMemory &&
        this.metrics.memoryUsage.gpu <= this.budget.maxGPUMemory;
    }

    return fpsOK && frameTimeOK && memoryOK;
  }

  /**
   * Should reduce quality
   */
  shouldReduceQuality(): boolean {
    if (this.qualityAdjustmentCooldown > 0) {
      return false;
    }

    if (this.currentQuality === QualityLevel.LOW) {
      return false; // Already at lowest
    }

    // Check if consistently below budget
    const avgFPS = this.getAverageFPS();
    const targetFPS = this.budget.targetFPS;

    if (avgFPS < targetFPS * 0.8) {
      // Consistently below 80% of target
      return true;
    }

    if (this.metrics.frameTime > this.budget.maxFrameTime * 1.2) {
      // Frame time exceeds budget by 20%
      return true;
    }

    return false;
  }

  /**
   * Should increase quality
   */
  shouldIncreaseQuality(): boolean {
    if (this.qualityAdjustmentCooldown > 0) {
      return false;
    }

    if (this.currentQuality === QualityLevel.ULTRA) {
      return false; // Already at highest
    }

    // Check if consistently above budget with headroom
    const avgFPS = this.getAverageFPS();
    const targetFPS = this.budget.targetFPS;

    if (avgFPS > targetFPS * 1.2) {
      // Consistently above 120% of target
      return true;
    }

    if (this.metrics.frameTime < this.budget.maxFrameTime * 0.7) {
      // Frame time well below budget (30% headroom)
      return true;
    }

    return false;
  }

  /**
   * Get recommended quality level
   */
  getRecommendedQuality(): QualityLevel {
    if (this.shouldReduceQuality()) {
      return Math.max(QualityLevel.LOW, this.currentQuality - 1) as QualityLevel;
    }

    if (this.shouldIncreaseQuality()) {
      return Math.min(QualityLevel.ULTRA, this.currentQuality + 1) as QualityLevel;
    }

    return this.currentQuality;
  }

  /**
   * Set current quality level
   */
  setQuality(level: QualityLevel): void {
    this.currentQuality = level;
    this.qualityAdjustmentCooldown = this.COOLDOWN_FRAMES;
    log.info(`Quality set to: ${QualityLevel[level]}`);
  }

  /**
   * Get current quality level
   */
  getQuality(): QualityLevel {
    return this.currentQuality;
  }

  /**
   * Get quality settings for a level
   */
  static getARQualitySettings(level: QualityLevel): ARQualitySettings {
    switch (level) {
      case QualityLevel.LOW:
        return {
          level,
          resolution: { width: 480, height: 360 },
          detectionInterval: 10,
          maxKeypoints: 200,
          enableSubPixel: false,
          enableTemporalFilter: false,
        };

      case QualityLevel.MEDIUM:
        return {
          level,
          resolution: { width: 640, height: 480 },
          detectionInterval: 5,
          maxKeypoints: 500,
          enableSubPixel: false,
          enableTemporalFilter: true,
        };

      case QualityLevel.HIGH:
        return {
          level,
          resolution: { width: 1280, height: 720 },
          detectionInterval: 3,
          maxKeypoints: 1000,
          enableSubPixel: true,
          enableTemporalFilter: true,
        };

      case QualityLevel.ULTRA:
        return {
          level,
          resolution: { width: 1920, height: 1080 },
          detectionInterval: 1,
          maxKeypoints: 2000,
          enableSubPixel: true,
          enableTemporalFilter: true,
        };
    }
  }

  /**
   * Get average FPS from history
   */
  private getAverageFPS(): number {
    if (this.fpsHistory.length === 0) {
      return this.metrics.fps;
    }

    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return sum / this.fpsHistory.length;
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.frameCount = 0;
    this.lastFPSUpdate = performance.now();
    this.fpsHistory = [];
    this.sectionTimes.clear();
    log.info('Metrics reset');
  }
}
