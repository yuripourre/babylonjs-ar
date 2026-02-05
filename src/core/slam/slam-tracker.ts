/**
 * SLAM Tracker
 * Handles frame-to-frame tracking using feature matching and pose estimation
 */

import type {
  TrackingResult,
  CameraPose,
  Keyframe,
  SLAMConfig,
} from './types';
import type { SLAMMapManager } from './slam-map';
import { FeatureMatcher, type FeatureMatch } from '../matching/feature-matcher';
import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import { Logger } from '../../utils/logger';
import {
  FEATURE_MATCH_DISTANCE_THRESHOLD,
  FEATURE_MATCH_RATIO_TEST_THRESHOLD,
  RELOCALIZATION_KEYFRAME_SEARCH_COUNT,
  DEFAULT_REPROJECTION_ERROR,
  RELOCALIZATION_REPROJECTION_ERROR,
  ORB_DESCRIPTOR_BYTES,
  ORB_DESCRIPTOR_UINT32_SIZE,
} from '../constants';

export interface TrackingContext {
  keypoints: Array<{ x: number; y: number; octave?: number; angle?: number }>;
  descriptors: Uint32Array | null;
  timestamp: number;
}

/**
 * SLAM Tracker
 * Responsible for frame-to-frame tracking and relocalization
 */
export class SLAMTracker {
  private logger = Logger.create('SLAMTracker');
  private featureMatcher: FeatureMatcher;
  private currentPose: CameraPose | null = null;
  private trackingState: 'tracking' | 'lost' = 'lost';

  constructor(
    private map: SLAMMapManager,
    private config: Required<SLAMConfig>
  ) {
    this.featureMatcher = new FeatureMatcher({
      matchThreshold: FEATURE_MATCH_DISTANCE_THRESHOLD,
      ratioTestThreshold: FEATURE_MATCH_RATIO_TEST_THRESHOLD,
      enableCrossCheck: false,
    });
  }

  /**
   * Track frame against last keyframe
   *
   * @param context Current frame data
   * @returns Tracking result with pose and match count
   */
  async trackFrame(context: TrackingContext): Promise<TrackingResult> {
    const { keypoints, descriptors, timestamp } = context;

    // Get last keyframe for matching
    const keyframes = this.map.getAllKeyframes();
    if (keyframes.length === 0) {
      return this.handleTrackingFailure(timestamp);
    }

    const lastKeyframe = keyframes[keyframes.length - 1];

    // Check if we have descriptors
    if (!descriptors || descriptors.length === 0) {
      this.logger.warn('No descriptors provided for tracking');
      return this.handleTrackingFailure(timestamp);
    }

    // Convert descriptors to Uint8Array format for matching
    const currentDescriptors = this.convertDescriptors(descriptors);
    const referenceDescriptors = lastKeyframe.features.map(f => f.descriptor);

    // Match features
    const matches = this.featureMatcher.match(
      currentDescriptors,
      referenceDescriptors
    );

    // Check if we have enough matches
    if (matches.length < this.config.minFeatureTracked) {
      console.warn(
        `[SLAMTracker] Tracking lost: only ${matches.length} matches found (need ${this.config.minFeatureTracked})`
      );
      this.trackingState = 'lost';
      return this.handleTrackingFailure(timestamp);
    }

    // TODO: Estimate pose using matched features and EPnP
    // For now, use last keyframe pose with small update
    if (!this.currentPose) {
      this.currentPose = {
        position: lastKeyframe.pose.position,
        rotation: lastKeyframe.pose.rotation,
        velocity: new Vector3(0, 0, 0),
        angularVelocity: new Vector3(0, 0, 0),
        timestamp,
      };
    } else {
      // Update timestamp
      this.currentPose.timestamp = timestamp;
    }

    this.trackingState = 'tracking';

    return {
      success: true,
      pose: this.currentPose,
      numTrackedFeatures: matches.length,
      numInliers: matches.length,
      reprojectionError: DEFAULT_REPROJECTION_ERROR, // TODO: compute actual reprojection error
      state: 'tracking',
    };
  }

  /**
   * Attempt relocalization after tracking loss
   *
   * @param context Current frame data
   * @returns Tracking result (success if relocalized)
   */
  async relocalize(context: TrackingContext): Promise<TrackingResult> {
    const { keypoints, descriptors, timestamp } = context;

    this.logger.info('Attempting relocalization...');

    // Get all keyframes
    const keyframes = this.map.getAllKeyframes();
    if (keyframes.length === 0) {
      return this.handleTrackingFailure(timestamp);
    }

    if (!descriptors || descriptors.length === 0) {
      return this.handleTrackingFailure(timestamp);
    }

    // Convert descriptors
    const currentDescriptors = this.convertDescriptors(descriptors);

    // Try to match against multiple keyframes
    let bestMatchCount = 0;
    let bestKeyframe: Keyframe | null = null;
    let bestMatches: FeatureMatch[] = [];

    // Search through recent keyframes
    const recentKeyframes = keyframes.slice(-RELOCALIZATION_KEYFRAME_SEARCH_COUNT);

    for (const keyframe of recentKeyframes) {
      const referenceDescriptors = keyframe.features.map(f => f.descriptor);
      const matches = this.featureMatcher.match(
        currentDescriptors,
        referenceDescriptors
      );

      if (matches.length > bestMatchCount) {
        bestMatchCount = matches.length;
        bestKeyframe = keyframe;
        bestMatches = matches;
      }
    }

    // Check if we found a good match
    if (bestMatchCount >= this.config.minFeatureTracked && bestKeyframe) {
      console.log(
        `[SLAMTracker] Relocalized with ${bestMatchCount} matches to keyframe #${bestKeyframe.id}`
      );

      // Use keyframe pose as initial estimate
      this.currentPose = {
        position: bestKeyframe.pose.position,
        rotation: bestKeyframe.pose.rotation,
        velocity: new Vector3(0, 0, 0),
        angularVelocity: new Vector3(0, 0, 0),
        timestamp,
      };

      this.trackingState = 'tracking';

      return {
        success: true,
        pose: this.currentPose,
        numTrackedFeatures: bestMatchCount,
        numInliers: bestMatchCount,
        reprojectionError: RELOCALIZATION_REPROJECTION_ERROR,
        state: 'tracking',
      };
    }

    // Relocalization failed
    this.logger.warn('Relocalization failed');
    return this.handleTrackingFailure(timestamp);
  }

  /**
   * Update current pose (called by VIO fusion or external pose estimate)
   *
   * @param pose New camera pose
   */
  updatePose(pose: CameraPose): void {
    this.currentPose = pose;
  }

  /**
   * Get current tracking state
   */
  getState(): 'tracking' | 'lost' {
    return this.trackingState;
  }

  /**
   * Get current pose
   */
  getCurrentPose(): CameraPose | null {
    return this.currentPose;
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.currentPose = null;
    this.trackingState = 'lost';
  }

  /**
   * Handle tracking failure
   */
  private handleTrackingFailure(timestamp: number): TrackingResult {
    this.trackingState = 'lost';

    return {
      success: false,
      pose: this.currentPose ?? this.createDefaultPose(timestamp),
      numTrackedFeatures: 0,
      numInliers: 0,
      reprojectionError: Infinity,
      state: 'lost',
    };
  }

  /**
   * Create default pose when no pose available
   */
  private createDefaultPose(timestamp: number): CameraPose {
    return {
      position: new Vector3(0, 0, 0),
      rotation: Quaternion.identity(),
      velocity: new Vector3(0, 0, 0),
      angularVelocity: new Vector3(0, 0, 0),
      timestamp,
    };
  }

  /**
   * Convert Uint32Array descriptors to array of Uint8Array
   * Each descriptor is ORB_DESCRIPTOR_BYTES (256 bits)
   */
  private convertDescriptors(descriptors: Uint32Array): Uint8Array[] {
    const numDescriptors = descriptors.length / ORB_DESCRIPTOR_UINT32_SIZE;
    const result: Uint8Array[] = [];

    for (let i = 0; i < numDescriptors; i++) {
      const descriptor = new Uint8Array(
        descriptors.buffer,
        i * ORB_DESCRIPTOR_BYTES,
        ORB_DESCRIPTOR_BYTES
      );
      result.push(descriptor);
    }

    return result;
  }
}
