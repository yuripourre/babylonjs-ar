/**
 * Adaptive Quality System
 * Dynamically adjusts rendering and processing quality based on performance
 * Phase 4 optimization for maintaining target framerate
 */

export interface QualitySettings {
  // Resolution scaling
  resolutionScale: number; // 0.5-1.0

  // Marker detection
  markerThresholdBlockSize: number;
  markerUpdateInterval: number; // ms between detections

  // Plane detection
  planeRANSACIterations: number;
  planeUpdateInterval: number;
  planeDownsampleFactor: number;

  // Feature tracking
  maxFeaturePoints: number;
  featureDetectionInterval: number;

  // Depth estimation
  depthResolutionScale: number;
  depthUpdateInterval: number;
  stereoSearchRange: number; // Disparity search range

  // Light estimation
  lightUpdateInterval: number;
  lightSHBands: number; // 4 or 9

  // Quality level (1-5, 5=highest)
  qualityLevel: number;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  gpuTime: number;
  cpuTime: number;
  droppedFrames: number;
}

export class AdaptiveQuality {
  private targetFPS: number;
  private currentSettings: QualitySettings;
  private performanceHistory: PerformanceMetrics[] = [];
  private historySize = 60; // 1 second at 60 FPS

  // Quality presets
  private static readonly QUALITY_PRESETS: Record<number, QualitySettings> = {
    1: {
      // Minimum quality
      resolutionScale: 0.5,
      markerThresholdBlockSize: 9,
      markerUpdateInterval: 200,
      planeRANSACIterations: 64,
      planeUpdateInterval: 300,
      planeDownsampleFactor: 4,
      maxFeaturePoints: 100,
      featureDetectionInterval: 100,
      depthResolutionScale: 0.25,
      depthUpdateInterval: 500,
      stereoSearchRange: 32,
      lightUpdateInterval: 1000,
      lightSHBands: 4,
      qualityLevel: 1,
    },
    2: {
      // Low quality
      resolutionScale: 0.6,
      markerThresholdBlockSize: 11,
      markerUpdateInterval: 150,
      planeRANSACIterations: 128,
      planeUpdateInterval: 200,
      planeDownsampleFactor: 3,
      maxFeaturePoints: 200,
      featureDetectionInterval: 75,
      depthResolutionScale: 0.4,
      depthUpdateInterval: 300,
      stereoSearchRange: 48,
      lightUpdateInterval: 750,
      lightSHBands: 4,
      qualityLevel: 2,
    },
    3: {
      // Medium quality (default)
      resolutionScale: 0.75,
      markerThresholdBlockSize: 13,
      markerUpdateInterval: 100,
      planeRANSACIterations: 192,
      planeUpdateInterval: 150,
      planeDownsampleFactor: 2,
      maxFeaturePoints: 300,
      featureDetectionInterval: 50,
      depthResolutionScale: 0.5,
      depthUpdateInterval: 200,
      stereoSearchRange: 64,
      lightUpdateInterval: 500,
      lightSHBands: 9,
      qualityLevel: 3,
    },
    4: {
      // High quality
      resolutionScale: 0.9,
      markerThresholdBlockSize: 15,
      markerUpdateInterval: 50,
      planeRANSACIterations: 256,
      planeUpdateInterval: 100,
      planeDownsampleFactor: 1,
      maxFeaturePoints: 500,
      featureDetectionInterval: 33,
      depthResolutionScale: 0.75,
      depthUpdateInterval: 100,
      stereoSearchRange: 96,
      lightUpdateInterval: 333,
      lightSHBands: 9,
      qualityLevel: 4,
    },
    5: {
      // Maximum quality
      resolutionScale: 1.0,
      markerThresholdBlockSize: 15,
      markerUpdateInterval: 33,
      planeRANSACIterations: 512,
      planeUpdateInterval: 50,
      planeDownsampleFactor: 1,
      maxFeaturePoints: 1000,
      featureDetectionInterval: 16,
      depthResolutionScale: 1.0,
      depthUpdateInterval: 50,
      stereoSearchRange: 128,
      lightUpdateInterval: 200,
      lightSHBands: 9,
      qualityLevel: 5,
    },
  };

  constructor(targetFPS: number = 60, initialQuality: number = 3) {
    this.targetFPS = targetFPS;
    this.currentSettings = { ...AdaptiveQuality.QUALITY_PRESETS[initialQuality] };
  }

  /**
   * Update performance metrics and adjust quality if needed
   */
  update(metrics: PerformanceMetrics): boolean {
    // Add to history
    this.performanceHistory.push(metrics);
    if (this.performanceHistory.length > this.historySize) {
      this.performanceHistory.shift();
    }

    // Need enough history to make decisions
    if (this.performanceHistory.length < 30) {
      return false; // No change yet
    }

    // Compute average FPS over last 30 frames
    const recentHistory = this.performanceHistory.slice(-30);
    const avgFPS =
      recentHistory.reduce((sum, m) => sum + m.fps, 0) / recentHistory.length;

    // Compute FPS stability (coefficient of variation)
    const stdDev = Math.sqrt(
      recentHistory.reduce((sum, m) => sum + Math.pow(m.fps - avgFPS, 2), 0) /
        recentHistory.length
    );
    const stability = 1 - stdDev / avgFPS; // 1 = stable, 0 = unstable

    // Decision thresholds
    const fpsRatio = avgFPS / this.targetFPS;
    const needsDowngrade = fpsRatio < 0.85 && stability > 0.7; // Consistently slow
    const canUpgrade = fpsRatio > 1.15 && stability > 0.8; // Consistently fast

    let changed = false;

    if (needsDowngrade && this.currentSettings.qualityLevel > 1) {
      this.decreaseQuality();
      console.log(
        `[AdaptiveQuality] Decreased to level ${this.currentSettings.qualityLevel} (FPS: ${avgFPS.toFixed(1)})`
      );
      changed = true;
    } else if (canUpgrade && this.currentSettings.qualityLevel < 5) {
      this.increaseQuality();
      console.log(
        `[AdaptiveQuality] Increased to level ${this.currentSettings.qualityLevel} (FPS: ${avgFPS.toFixed(1)})`
      );
      changed = true;
    }

    return changed;
  }

  /**
   * Decrease quality by one level
   */
  private decreaseQuality(): void {
    const newLevel = Math.max(1, this.currentSettings.qualityLevel - 1);
    this.currentSettings = {
      ...AdaptiveQuality.QUALITY_PRESETS[newLevel],
    };

    // Clear history after quality change
    this.performanceHistory = [];
  }

  /**
   * Increase quality by one level
   */
  private increaseQuality(): void {
    const newLevel = Math.min(5, this.currentSettings.qualityLevel + 1);
    this.currentSettings = {
      ...AdaptiveQuality.QUALITY_PRESETS[newLevel],
    };

    // Clear history after quality change
    this.performanceHistory = [];
  }

  /**
   * Get current quality settings
   */
  getSettings(): QualitySettings {
    return { ...this.currentSettings };
  }

  /**
   * Override specific settings
   */
  overrideSettings(overrides: Partial<QualitySettings>): void {
    this.currentSettings = {
      ...this.currentSettings,
      ...overrides,
    };
  }

  /**
   * Reset to specific quality level
   */
  setQualityLevel(level: number): void {
    if (level < 1 || level > 5) {
      throw new Error('Quality level must be between 1 and 5');
    }
    this.currentSettings = {
      ...AdaptiveQuality.QUALITY_PRESETS[level],
    };
    this.performanceHistory = [];
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    avgFPS: number;
    minFPS: number;
    maxFPS: number;
    avgFrameTime: number;
    stability: number;
  } {
    if (this.performanceHistory.length === 0) {
      return {
        avgFPS: 0,
        minFPS: 0,
        maxFPS: 0,
        avgFrameTime: 0,
        stability: 0,
      };
    }

    const avgFPS =
      this.performanceHistory.reduce((sum, m) => sum + m.fps, 0) /
      this.performanceHistory.length;

    const minFPS = Math.min(...this.performanceHistory.map((m) => m.fps));
    const maxFPS = Math.max(...this.performanceHistory.map((m) => m.fps));

    const avgFrameTime =
      this.performanceHistory.reduce((sum, m) => sum + m.frameTime, 0) /
      this.performanceHistory.length;

    const stdDev = Math.sqrt(
      this.performanceHistory.reduce(
        (sum, m) => sum + Math.pow(m.fps - avgFPS, 2),
        0
      ) / this.performanceHistory.length
    );
    const stability = Math.max(0, 1 - stdDev / avgFPS);

    return {
      avgFPS,
      minFPS,
      maxFPS,
      avgFrameTime,
      stability,
    };
  }

  /**
   * Force quality adjustment based on platform
   */
  static detectPlatformQuality(): number {
    // Detect platform capabilities
    const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(
      navigator.userAgent
    );
    const hasGPU = 'gpu' in navigator;

    if (!hasGPU) {
      return 1; // Minimum if no WebGPU
    }

    if (isMobile) {
      // Mobile: start conservative
      return 2;
    }

    // Desktop: start at medium
    return 3;
  }
}
