/**
 * AR Tracker
 * Coordinates marker detection, pose estimation, and filtering
 */

import type { GPUContextManager } from '../gpu/gpu-context';
import { MarkerDetector, type DetectedMarker, type MarkerDetectorConfig } from '../detection/marker-detector';
import { PoseEstimator, type CameraIntrinsics, type Pose } from './pose-estimator';
import { KalmanFilter } from './kalman-filter';

export interface TrackedMarker {
  id: number;
  pose: Pose;
  confidence: number;
  lastSeen: number;
  trackingState: 'tracking' | 'lost';
}

export interface TrackerConfig {
  markerDetectorConfig?: MarkerDetectorConfig;
  cameraIntrinsics?: CameraIntrinsics;
  kalmanProcessNoise?: number;
  kalmanMeasurementNoise?: number;
  lostTrackingTimeout?: number; // ms
}

export class Tracker {
  private gpuContext: GPUContextManager;
  private markerDetector: MarkerDetector;
  private poseEstimator: PoseEstimator;

  // Tracked markers with Kalman filters
  private trackedMarkers: Map<number, {
    marker: TrackedMarker;
    filter: KalmanFilter;
  }>;

  private config: Required<Omit<TrackerConfig, 'markerDetectorConfig' | 'cameraIntrinsics'>>;
  private isInitialized = false;

  constructor(gpuContext: GPUContextManager, config: TrackerConfig = {}) {
    this.gpuContext = gpuContext;

    // Initialize marker detector
    this.markerDetector = new MarkerDetector(
      gpuContext,
      config.markerDetectorConfig
    );

    // Initialize pose estimator with intrinsics
    const intrinsics = config.cameraIntrinsics ??
      PoseEstimator.estimateIntrinsics(1280, 720); // Default resolution
    this.poseEstimator = new PoseEstimator(intrinsics);

    // Configuration
    this.config = {
      kalmanProcessNoise: config.kalmanProcessNoise ?? 0.01,
      kalmanMeasurementNoise: config.kalmanMeasurementNoise ?? 0.1,
      lostTrackingTimeout: config.lostTrackingTimeout ?? 500,
    };

    this.trackedMarkers = new Map();
  }

  /**
   * Initialize tracker
   */
  async initialize(width: number, height: number): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.markerDetector.initialize(width, height);

    // Update camera intrinsics for actual resolution
    const intrinsics = PoseEstimator.estimateIntrinsics(width, height);
    this.poseEstimator.updateIntrinsics(intrinsics);

    this.isInitialized = true;
    console.log('[Tracker] Initialized');
  }

  /**
   * Track markers in frame
   */
  async track(grayscaleTexture: GPUTexture): Promise<TrackedMarker[]> {
    if (!this.isInitialized) {
      throw new Error('Tracker not initialized');
    }

    const now = performance.now();

    // Predict all tracked markers
    for (const [id, tracked] of this.trackedMarkers) {
      tracked.filter.predict();

      // Check if tracking is lost (no detection for timeout period)
      if (now - tracked.marker.lastSeen > this.config.lostTrackingTimeout) {
        tracked.marker.trackingState = 'lost';
      }
    }

    // Detect markers in current frame
    const detectedMarkers = await this.markerDetector.detect(grayscaleTexture);

    // Update tracked markers with detections
    for (const detected of detectedMarkers) {
      this.updateTracking(detected, now);
    }

    // Remove lost markers after extended timeout
    const extendedTimeout = this.config.lostTrackingTimeout * 3;
    for (const [id, tracked] of this.trackedMarkers) {
      if (now - tracked.marker.lastSeen > extendedTimeout) {
        this.trackedMarkers.delete(id);
        console.log(`[Tracker] Removed marker ${id} (lost tracking)`);
      }
    }

    // Return currently tracked markers
    return Array.from(this.trackedMarkers.values())
      .map(t => ({
        ...t.marker,
        pose: t.filter.getPose(),
      }));
  }

  /**
   * Update tracking for detected marker
   */
  private updateTracking(detected: DetectedMarker, timestamp: number): void {
    const markerSize = 0.1; // 10cm - should come from config
    const estimatedPose = this.poseEstimator.estimatePose(
      detected.corners,
      markerSize
    );

    if (!estimatedPose) {
      return;
    }

    let tracked = this.trackedMarkers.get(detected.id);

    if (!tracked) {
      // New marker - initialize tracking
      const filter = new KalmanFilter(
        this.config.kalmanProcessNoise,
        this.config.kalmanMeasurementNoise
      );
      filter.initialize(estimatedPose);

      tracked = {
        marker: {
          id: detected.id,
          pose: estimatedPose,
          confidence: detected.confidence,
          lastSeen: timestamp,
          trackingState: 'tracking',
        },
        filter,
      };

      this.trackedMarkers.set(detected.id, tracked);
      console.log(`[Tracker] Started tracking marker ${detected.id}`);
    } else {
      // Update existing tracking
      tracked.filter.update(estimatedPose);
      tracked.marker.pose = tracked.filter.getPose();
      tracked.marker.confidence = detected.confidence;
      tracked.marker.lastSeen = timestamp;
      tracked.marker.trackingState = 'tracking';
    }
  }

  /**
   * Get specific tracked marker
   */
  getMarker(id: number): TrackedMarker | null {
    const tracked = this.trackedMarkers.get(id);
    if (!tracked) {
      return null;
    }

    return {
      ...tracked.marker,
      pose: tracked.filter.getPose(),
    };
  }

  /**
   * Get all tracked marker IDs
   */
  getTrackedMarkerIds(): number[] {
    return Array.from(this.trackedMarkers.keys());
  }

  /**
   * Update camera intrinsics
   */
  updateCameraIntrinsics(intrinsics: CameraIntrinsics): void {
    this.poseEstimator.updateIntrinsics(intrinsics);
  }

  /**
   * Reset tracking for all markers
   */
  reset(): void {
    this.trackedMarkers.clear();
    console.log('[Tracker] Reset all tracking');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.markerDetector.destroy();
    this.trackedMarkers.clear();
    this.isInitialized = false;
  }
}
