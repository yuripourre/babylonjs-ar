/**
 * Performance Monitor
 * Tracks frame times, GPU operations, and provides profiling data
 */

export interface PerformanceMetrics {
  fps: number;
  frameTime: number; // ms
  gpuTime: number; // ms (if available)
  cpuTime: number; // ms

  // Stage breakdowns
  cameraAcquisition: number;
  preprocessing: number;
  detection: number;
  tracking: number;
  estimation: number;

  // Memory
  memoryUsage?: number; // MB
  textureMemory?: number; // MB

  // Counts
  markerCount: number;
  planeCount: number;
  featureCount: number;
}

export interface PerformanceConfig {
  sampleWindow?: number; // Number of frames to average
  enableGPUTiming?: boolean;
  logInterval?: number; // ms, 0 to disable
}

interface TimingEntry {
  timestamp: number;
  duration: number;
}

export class PerformanceMonitor {
  private config: Required<PerformanceConfig>;

  // Frame timing
  private frameStartTime = 0;
  private frameCount = 0;
  private lastLogTime = 0;

  // Stage timings (circular buffers)
  private stageTimes: Map<string, TimingEntry[]> = new Map();
  private stageStarts: Map<string, number> = new Map();

  // FPS tracking
  private frameTimes: number[] = [];
  private lastFrameTime = 0;

  // GPU timing (if available)
  private gpuTimingEnabled = false;
  private timestampQuerySet: GPUQuerySet | null = null;
  private timestampBuffer: GPUBuffer | null = null;
  private timestampReadBuffer: GPUBuffer | null = null;

  // Current metrics
  private currentMetrics: PerformanceMetrics = {
    fps: 0,
    frameTime: 0,
    gpuTime: 0,
    cpuTime: 0,
    cameraAcquisition: 0,
    preprocessing: 0,
    detection: 0,
    tracking: 0,
    estimation: 0,
    markerCount: 0,
    planeCount: 0,
    featureCount: 0,
  };

  constructor(config: PerformanceConfig = {}) {
    this.config = {
      sampleWindow: config.sampleWindow ?? 60,
      enableGPUTiming: config.enableGPUTiming ?? false,
      logInterval: config.logInterval ?? 1000,
    };

    // Initialize stage timing buffers
    const stages = ['camera', 'preprocessing', 'detection', 'tracking', 'estimation'];
    for (const stage of stages) {
      this.stageTimes.set(stage, []);
    }
  }

  /**
   * Initialize GPU timing (if supported)
   */
  async initializeGPUTiming(device: GPUDevice): Promise<void> {
    if (!this.config.enableGPUTiming) {
      return;
    }

    // Check if timestamp queries are supported
    if (!device.features.has('timestamp-query')) {
      console.warn('[PerformanceMonitor] GPU timestamp queries not supported');
      return;
    }

    try {
      this.timestampQuerySet = device.createQuerySet({
        type: 'timestamp',
        count: 16, // Support for 8 begin/end pairs
      });

      this.timestampBuffer = device.createBuffer({
        size: 16 * 8, // 16 timestamps × 8 bytes
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });

      this.timestampReadBuffer = device.createBuffer({
        size: 16 * 8,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      this.gpuTimingEnabled = true;
      console.log('[PerformanceMonitor] GPU timing enabled');
    } catch (error) {
      console.warn('[PerformanceMonitor] Failed to initialize GPU timing:', error);
    }
  }

  /**
   * Start frame timing
   */
  frameStart(): void {
    this.frameStartTime = performance.now();
    this.frameCount++;
  }

  /**
   * End frame timing
   */
  frameEnd(): void {
    const now = performance.now();
    const frameTime = now - this.frameStartTime;

    // Add to frame times buffer
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > this.config.sampleWindow) {
      this.frameTimes.shift();
    }

    // Calculate FPS
    if (this.lastFrameTime > 0) {
      const delta = now - this.lastFrameTime;
      const fps = 1000 / delta;

      // Update metrics
      this.currentMetrics.fps = Math.round(fps);
    }
    this.lastFrameTime = now;

    // Average frame time
    const avgFrameTime =
      this.frameTimes.reduce((sum, t) => sum + t, 0) / this.frameTimes.length;
    this.currentMetrics.frameTime = Math.round(avgFrameTime * 100) / 100;

    // Log periodically
    if (
      this.config.logInterval > 0 &&
      now - this.lastLogTime >= this.config.logInterval
    ) {
      this.log();
      this.lastLogTime = now;
    }
  }

  /**
   * Start timing a stage
   */
  stageStart(stage: string): void {
    this.stageStarts.set(stage, performance.now());
  }

  /**
   * End timing a stage
   */
  stageEnd(stage: string): void {
    const start = this.stageStarts.get(stage);
    if (start === undefined) {
      return;
    }

    const duration = performance.now() - start;
    this.stageStarts.delete(stage);

    // Add to circular buffer
    let buffer = this.stageTimes.get(stage);
    if (!buffer) {
      buffer = [];
      this.stageTimes.set(stage, buffer);
    }

    buffer.push({ timestamp: performance.now(), duration });
    if (buffer.length > this.config.sampleWindow) {
      buffer.shift();
    }

    // Update metrics
    const avgDuration =
      buffer.reduce((sum, entry) => sum + entry.duration, 0) / buffer.length;

    switch (stage) {
      case 'camera':
        this.currentMetrics.cameraAcquisition = Math.round(avgDuration * 100) / 100;
        break;
      case 'preprocessing':
        this.currentMetrics.preprocessing = Math.round(avgDuration * 100) / 100;
        break;
      case 'detection':
        this.currentMetrics.detection = Math.round(avgDuration * 100) / 100;
        break;
      case 'tracking':
        this.currentMetrics.tracking = Math.round(avgDuration * 100) / 100;
        break;
      case 'estimation':
        this.currentMetrics.estimation = Math.round(avgDuration * 100) / 100;
        break;
    }
  }

  /**
   * Update counts
   */
  updateCounts(markers: number, planes: number, features: number): void {
    this.currentMetrics.markerCount = markers;
    this.currentMetrics.planeCount = planes;
    this.currentMetrics.featureCount = features;
  }

  /**
   * Estimate memory usage
   */
  updateMemory(textureMemory: number): void {
    this.currentMetrics.textureMemory = Math.round(textureMemory / (1024 * 1024) * 100) / 100;

    // Estimate total memory if performance.memory is available
    if ('memory' in performance && (performance as any).memory) {
      const mem = (performance as any).memory;
      this.currentMetrics.memoryUsage =
        Math.round(mem.usedJSHeapSize / (1024 * 1024) * 100) / 100;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    // Calculate CPU time (frame time - GPU time)
    this.currentMetrics.cpuTime = Math.max(
      0,
      this.currentMetrics.frameTime - this.currentMetrics.gpuTime
    );

    return { ...this.currentMetrics };
  }

  /**
   * Get stage breakdown as percentages
   */
  getStageBreakdown(): Record<string, number> {
    const total = this.currentMetrics.frameTime;
    if (total === 0) {
      return {};
    }

    return {
      camera: Math.round((this.currentMetrics.cameraAcquisition / total) * 100),
      preprocessing: Math.round((this.currentMetrics.preprocessing / total) * 100),
      detection: Math.round((this.currentMetrics.detection / total) * 100),
      tracking: Math.round((this.currentMetrics.tracking / total) * 100),
      estimation: Math.round((this.currentMetrics.estimation / total) * 100),
    };
  }

  /**
   * Log performance metrics
   */
  log(): void {
    const metrics = this.getMetrics();
    const breakdown = this.getStageBreakdown();

    console.log(`[Performance] FPS: ${metrics.fps} | Frame: ${metrics.frameTime}ms`);
    console.log(
      `  Camera: ${metrics.cameraAcquisition}ms (${breakdown.camera}%) | ` +
        `Preprocess: ${metrics.preprocessing}ms (${breakdown.preprocessing}%)`
    );
    console.log(
      `  Detection: ${metrics.detection}ms (${breakdown.detection}%) | ` +
        `Tracking: ${metrics.tracking}ms (${breakdown.tracking}%) | ` +
        `Estimation: ${metrics.estimation}ms (${breakdown.estimation}%)`
    );
    console.log(
      `  Markers: ${metrics.markerCount} | ` +
        `Planes: ${metrics.planeCount} | ` +
        `Features: ${metrics.featureCount}`
    );

    if (metrics.memoryUsage !== undefined) {
      console.log(`  Memory: ${metrics.memoryUsage}MB (Textures: ${metrics.textureMemory}MB)`);
    }
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const breakdown = this.getStageBreakdown();

    let report = '# Performance Report\n\n';
    report += `**FPS:** ${metrics.fps}\n`;
    report += `**Frame Time:** ${metrics.frameTime}ms\n\n`;

    report += '## Stage Breakdown\n\n';
    report += `- Camera Acquisition: ${metrics.cameraAcquisition}ms (${breakdown.camera}%)\n`;
    report += `- Preprocessing: ${metrics.preprocessing}ms (${breakdown.preprocessing}%)\n`;
    report += `- Detection: ${metrics.detection}ms (${breakdown.detection}%)\n`;
    report += `- Tracking: ${metrics.tracking}ms (${breakdown.tracking}%)\n`;
    report += `- Estimation: ${metrics.estimation}ms (${breakdown.estimation}%)\n\n`;

    report += '## Counts\n\n';
    report += `- Markers: ${metrics.markerCount}\n`;
    report += `- Planes: ${metrics.planeCount}\n`;
    report += `- Features: ${metrics.featureCount}\n\n`;

    if (metrics.memoryUsage !== undefined) {
      report += '## Memory\n\n';
      report += `- Total: ${metrics.memoryUsage}MB\n`;
      report += `- Textures: ${metrics.textureMemory}MB\n`;
    }

    return report;
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.frameCount = 0;
    this.frameTimes = [];
    this.lastFrameTime = 0;

    for (const buffer of this.stageTimes.values()) {
      buffer.length = 0;
    }

    this.currentMetrics = {
      fps: 0,
      frameTime: 0,
      gpuTime: 0,
      cpuTime: 0,
      cameraAcquisition: 0,
      preprocessing: 0,
      detection: 0,
      tracking: 0,
      estimation: 0,
      markerCount: 0,
      planeCount: 0,
      featureCount: 0,
    };
  }

  /**
   * Check if performance is acceptable
   */
  isPerformanceAcceptable(targetFPS: number = 30): boolean {
    return this.currentMetrics.fps >= targetFPS * 0.9; // 90% of target
  }

  /**
   * Suggest optimizations based on bottlenecks
   */
  suggestOptimizations(): string[] {
    const suggestions: string[] = [];
    const breakdown = this.getStageBreakdown();

    if (this.currentMetrics.fps < 30) {
      suggestions.push('FPS below 30: Consider reducing resolution or quality settings');
    }

    if (breakdown.detection > 40) {
      suggestions.push('Detection is bottleneck: Reduce RANSAC iterations or downsample input');
    }

    if (breakdown.preprocessing > 30) {
      suggestions.push('Preprocessing is slow: Reduce image resolution or pyramid levels');
    }

    if (breakdown.tracking > 25) {
      suggestions.push('Tracking is slow: Reduce number of features or marker count');
    }

    if (this.currentMetrics.memoryUsage && this.currentMetrics.memoryUsage > 500) {
      suggestions.push('High memory usage: Consider releasing unused resources');
    }

    return suggestions;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.timestampQuerySet?.destroy();
    this.timestampBuffer?.destroy();
    this.timestampReadBuffer?.destroy();
  }
}
