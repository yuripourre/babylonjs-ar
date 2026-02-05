/**
 * Light Estimator
 * Analyzes camera frames to estimate real-world lighting conditions
 *
 * Features:
 * - Ambient light intensity estimation
 * - Primary light direction and color detection
 * - Spherical harmonics for image-based lighting
 * - Environment map generation
 * - Temporal smoothing to prevent flickering
 * - WebXR XRLightProbe integration with CPU fallback
 */

import { Vector3 } from '../math/vector';
import { SphericalHarmonics } from './spherical-harmonics';
import { Logger } from '../../utils/logger';

const log = Logger.create('LightEstimator');

/**
 * RGB color representation
 */
export interface RGB {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
}

/**
 * Comprehensive light estimation result
 */
export interface LightEstimate {
  // Basic lighting
  ambientIntensity: number;           // 0-1, overall scene brightness
  primaryDirection: Vector3;          // Direction to primary light source (normalized)
  primaryIntensity: number;           // 0-1, brightness of primary light
  primaryColor: RGB;                  // Color of primary light

  // Advanced lighting (for PBR)
  sphericalHarmonics: Float32Array;   // 9 SH coefficients per channel (27 floats)
  environmentMap?: HTMLCanvasElement; // Optional cube map for reflections
  colorTemperature: number;           // In Kelvin (2000-10000)

  // Metadata
  confidence: number;                 // 0-1, estimation quality
  timestamp: number;                  // When this was captured
  source: 'xr-native' | 'cpu-fallback'; // How this was estimated
}

/**
 * Configuration for light estimation
 */
export interface LightEstimatorConfig {
  // Sampling
  sampleSize?: number;                // Downsample frame to NxN for analysis (default: 64)
  updateInterval?: number;            // Min ms between updates (default: 100)

  // Smoothing
  temporalSmoothing?: number;         // 0-1, smoothing factor (default: 0.8)

  // Quality
  enableEnvironmentMap?: boolean;     // Generate cube map (expensive, default: false)
  enableSphericalHarmonics?: boolean; // Calculate SH (default: true)

  // XR integration
  preferXRLightProbe?: boolean;       // Use native XR light probe if available (default: true)
}

/**
 * Light probe data from WebXR
 */
interface XRLightProbeData {
  primaryDirection: DOMPointReadOnly;
  primaryIntensity: number;
  sphericalHarmonics: Float32Array;
}

/**
 * Main light estimator class
 */
export class LightEstimator {
  private config: Required<LightEstimatorConfig>;
  private lastEstimate: LightEstimate | null = null;
  private lastUpdateTime = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // XR light probe support
  private xrLightProbe: XRLightProbe | null = null;
  private xrSession: XRSession | null = null;

  // Spherical harmonics calculator
  private shCalculator: SphericalHarmonics;

  constructor(config: LightEstimatorConfig = {}) {
    this.config = {
      sampleSize: config.sampleSize ?? 64,
      updateInterval: config.updateInterval ?? 100,
      temporalSmoothing: config.temporalSmoothing ?? 0.8,
      enableEnvironmentMap: config.enableEnvironmentMap ?? false,
      enableSphericalHarmonics: config.enableSphericalHarmonics ?? true,
      preferXRLightProbe: config.preferXRLightProbe ?? true,
    };

    // Create canvas for image analysis
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.sampleSize;
    this.canvas.height = this.config.sampleSize;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    this.shCalculator = new SphericalHarmonics();

    log.info('Light estimator initialized', {
      sampleSize: this.config.sampleSize,
      sphericalHarmonics: this.config.enableSphericalHarmonics,
      environmentMap: this.config.enableEnvironmentMap,
    });
  }

  /**
   * Initialize XR light probe if available
   */
  async initXRLightProbe(xrSession: XRSession): Promise<boolean> {
    if (!this.config.preferXRLightProbe) {
      return false;
    }

    // Check if XR light probe is supported
    if (!('requestLightProbe' in xrSession)) {
      log.warn('XR light probe not supported');
      return false;
    }

    try {
      this.xrSession = xrSession;
      // Request light probe with reflection format
      this.xrLightProbe = await xrSession.requestLightProbe({
        reflectionFormat: 'rgba16f', // HDR format
      } as XRLightProbeInit);

      log.info('XR light probe initialized');
      return true;
    } catch (error) {
      log.error('Failed to initialize XR light probe', error);
      return false;
    }
  }

  /**
   * Estimate lighting from current frame
   */
  async estimate(
    frame: VideoFrame | HTMLVideoElement | ImageBitmap,
    xrFrame?: XRFrame
  ): Promise<LightEstimate> {
    const now = performance.now();

    // Check if we should update (throttling)
    if (now - this.lastUpdateTime < this.config.updateInterval && this.lastEstimate) {
      return this.lastEstimate;
    }

    let estimate: LightEstimate;

    // Try XR native light probe first
    if (xrFrame && this.xrLightProbe) {
      estimate = this.estimateFromXR(xrFrame);
    } else {
      // Fallback to CPU-based estimation
      estimate = await this.estimateFromFrame(frame);
    }

    // Apply temporal smoothing
    if (this.lastEstimate && this.config.temporalSmoothing > 0) {
      estimate = this.smoothEstimate(this.lastEstimate, estimate);
    }

    this.lastEstimate = estimate;
    this.lastUpdateTime = now;

    return estimate;
  }

  /**
   * Estimate lighting from XR light probe (native)
   */
  private estimateFromXR(xrFrame: XRFrame): LightEstimate {
    if (!this.xrLightProbe) {
      throw new Error('XR light probe not initialized');
    }

    const lightEstimate = xrFrame.getLightEstimate(this.xrLightProbe);
    if (!lightEstimate) {
      throw new Error('Failed to get XR light estimate');
    }

    // Extract spherical harmonics
    const sh = lightEstimate.primaryLightIntensity;
    const shArray = new Float32Array(27);

    // XR provides SH coefficients
    // Note: Actual API may vary, this is conceptual
    const xrSH = (lightEstimate as any).sphericalHarmonicsCoefficients;
    if (xrSH) {
      shArray.set(xrSH);
    }

    // Get primary light direction
    const direction = lightEstimate.primaryLightDirection;
    const primaryDirection = new Vector3(direction.x, direction.y, direction.z).normalize();

    // Calculate ambient intensity from SH
    const ambientIntensity = Math.min(sh.x + sh.y + sh.z, 1.0);

    return {
      ambientIntensity,
      primaryDirection,
      primaryIntensity: ambientIntensity,
      primaryColor: { r: 1, g: 1, b: 1 }, // XR doesn't provide color temp
      sphericalHarmonics: shArray,
      colorTemperature: 6500, // Assume daylight
      confidence: 0.95, // High confidence for native
      timestamp: performance.now(),
      source: 'xr-native',
    };
  }

  /**
   * Estimate lighting from camera frame (CPU fallback)
   */
  private async estimateFromFrame(
    frame: VideoFrame | HTMLVideoElement | ImageBitmap
  ): Promise<LightEstimate> {
    // Draw frame to canvas at reduced resolution
    this.ctx.drawImage(
      frame as any,
      0,
      0,
      this.config.sampleSize,
      this.config.sampleSize
    );

    // Get pixel data
    const imageData = this.ctx.getImageData(
      0,
      0,
      this.config.sampleSize,
      this.config.sampleSize
    );
    const pixels = imageData.data;

    // Calculate statistics
    const stats = this.calculateImageStatistics(pixels);

    // Estimate ambient intensity
    const ambientIntensity = stats.averageBrightness;

    // Estimate primary light direction
    const primaryDirection = this.estimateLightDirection(pixels);

    // Estimate color temperature
    const colorTemperature = this.estimateColorTemperature(stats);

    // Calculate primary light color from color temperature
    const primaryColor = this.colorTemperatureToRGB(colorTemperature);

    // Calculate spherical harmonics
    let sphericalHarmonics: Float32Array = new Float32Array(27);
    if (this.config.enableSphericalHarmonics) {
      sphericalHarmonics = this.shCalculator.calculateFromImage(imageData) as Float32Array;
    }

    return {
      ambientIntensity,
      primaryDirection,
      primaryIntensity: stats.maxBrightness,
      primaryColor,
      sphericalHarmonics,
      colorTemperature,
      confidence: 0.7, // Lower confidence for CPU estimation
      timestamp: performance.now(),
      source: 'cpu-fallback',
    };
  }

  /**
   * Calculate image statistics
   */
  private calculateImageStatistics(pixels: Uint8ClampedArray): {
    averageBrightness: number;
    maxBrightness: number;
    averageColor: RGB;
    colorRatio: { r: number; g: number; b: number };
  } {
    let totalR = 0, totalG = 0, totalB = 0;
    let totalBrightness = 0;
    let maxBrightness = 0;
    const numPixels = pixels.length / 4;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;

      totalR += r;
      totalG += g;
      totalB += b;

      // Calculate perceived brightness (luminance)
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += brightness;
      maxBrightness = Math.max(maxBrightness, brightness);
    }

    const avgR = totalR / numPixels;
    const avgG = totalG / numPixels;
    const avgB = totalB / numPixels;
    const avgBrightness = totalBrightness / numPixels;

    // Calculate color ratios
    const sum = avgR + avgG + avgB;
    const colorRatio = {
      r: sum > 0 ? avgR / sum : 0.33,
      g: sum > 0 ? avgG / sum : 0.33,
      b: sum > 0 ? avgB / sum : 0.34,
    };

    return {
      averageBrightness: avgBrightness,
      maxBrightness,
      averageColor: { r: avgR, g: avgG, b: avgB },
      colorRatio,
    };
  }

  /**
   * Estimate primary light direction from brightness gradients
   */
  private estimateLightDirection(pixels: Uint8ClampedArray): Vector3 {
    const size = this.config.sampleSize;
    let dx = 0, dy = 0;

    // Calculate brightness gradients
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = (y * size + x) * 4;

        // Get brightness
        const center = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
        const right = (pixels[idx + 4] + pixels[idx + 5] + pixels[idx + 6]) / 3;
        const bottom = (pixels[idx + size * 4] + pixels[idx + size * 4 + 1] + pixels[idx + size * 4 + 2]) / 3;

        dx += (right - center);
        dy += (bottom - center);
      }
    }

    // Normalize and convert to 3D direction
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    // Assume light comes from brighter side
    // Default to overhead light if no strong gradient
    const direction = new Vector3(-dx, 1.0, -dy);
    return direction.normalize();
  }

  /**
   * Estimate color temperature from color ratios
   */
  private estimateColorTemperature(stats: {
    colorRatio: { r: number; g: number; b: number };
  }): number {
    const { r, g, b } = stats.colorRatio;

    // Blue-ish = higher temperature (daylight ~6500K)
    // Yellow/orange-ish = lower temperature (tungsten ~3000K)
    const blueRatio = b / (r + 0.001);

    if (blueRatio > 1.2) {
      // Cool daylight
      return 6500 + (blueRatio - 1.2) * 2000;
    } else if (blueRatio < 0.8) {
      // Warm tungsten
      return 3000 - (0.8 - blueRatio) * 1000;
    } else {
      // Neutral
      return 5000 + (blueRatio - 1.0) * 3000;
    }
  }

  /**
   * Convert color temperature to RGB
   */
  private colorTemperatureToRGB(kelvin: number): RGB {
    // Clamp temperature
    kelvin = Math.max(1000, Math.min(40000, kelvin));
    const temp = kelvin / 100;

    let r: number, g: number, b: number;

    // Calculate red
    if (temp <= 66) {
      r = 255;
    } else {
      r = temp - 60;
      r = 329.698727446 * Math.pow(r, -0.1332047592);
      r = Math.max(0, Math.min(255, r));
    }

    // Calculate green
    if (temp <= 66) {
      g = temp;
      g = 99.4708025861 * Math.log(g) - 161.1195681661;
    } else {
      g = temp - 60;
      g = 288.1221695283 * Math.pow(g, -0.0755148492);
    }
    g = Math.max(0, Math.min(255, g));

    // Calculate blue
    if (temp >= 66) {
      b = 255;
    } else if (temp <= 19) {
      b = 0;
    } else {
      b = temp - 10;
      b = 138.5177312231 * Math.log(b) - 305.0447927307;
      b = Math.max(0, Math.min(255, b));
    }

    return {
      r: r / 255,
      g: g / 255,
      b: b / 255,
    };
  }

  /**
   * Apply temporal smoothing between estimates
   */
  private smoothEstimate(
    previous: LightEstimate,
    current: LightEstimate
  ): LightEstimate {
    const alpha = 1 - this.config.temporalSmoothing;

    return {
      ambientIntensity: this.lerp(previous.ambientIntensity, current.ambientIntensity, alpha),
      primaryDirection: previous.primaryDirection.lerp(current.primaryDirection, alpha),
      primaryIntensity: this.lerp(previous.primaryIntensity, current.primaryIntensity, alpha),
      primaryColor: {
        r: this.lerp(previous.primaryColor.r, current.primaryColor.r, alpha),
        g: this.lerp(previous.primaryColor.g, current.primaryColor.g, alpha),
        b: this.lerp(previous.primaryColor.b, current.primaryColor.b, alpha),
      },
      sphericalHarmonics: this.lerpArray(
        previous.sphericalHarmonics,
        current.sphericalHarmonics,
        alpha
      ),
      colorTemperature: this.lerp(previous.colorTemperature, current.colorTemperature, alpha),
      confidence: current.confidence,
      timestamp: current.timestamp,
      source: current.source,
      environmentMap: current.environmentMap,
    };
  }

  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Linear interpolation for arrays
   */
  private lerpArray(a: Float32Array, b: Float32Array, t: number): Float32Array {
    const result = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = this.lerp(a[i], b[i], t);
    }
    return result;
  }

  /**
   * Get the last light estimate (cached)
   */
  getLastEstimate(): LightEstimate | null {
    return this.lastEstimate;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LightEstimatorConfig>): void {
    Object.assign(this.config, config);
    log.debug('Configuration updated', config);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.xrLightProbe = null;
    this.xrSession = null;
    this.lastEstimate = null;
    log.info('Light estimator destroyed');
  }
}
