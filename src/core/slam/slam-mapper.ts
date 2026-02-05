/**
 * SLAM Mapper
 * Handles map management, keyframe creation, and loop closure coordination
 */

import type {
  SLAMConfig,
  Keyframe,
  KeyframePose,
  KeyframeFeature,
  CameraIntrinsics,
  CameraPose,
} from './types';
import type { SLAMMapManager } from './slam-map';
import { KeyframeManager, type KeyframeCandidate } from './keyframe-manager';
import { LoopClosureDetector } from './loop-closure';
import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import { Matrix4 } from '../math/matrix';
import { ORB_DESCRIPTOR_BYTES } from '../constants';
import { Logger } from '../../utils/logger';

export interface KeyframeCreationContext {
  timestamp: number;
  pose: CameraPose;
  keypoints: Array<{ x: number; y: number; octave?: number; angle?: number }>;
  descriptors: Uint32Array | null;
  numTrackedFeatures: number;
}

/**
 * SLAM Mapper
 * Responsible for map management and keyframe creation
 */
export class SLAMMapper {
  private logger = Logger.create('SLAMMapper');
  private keyframeManager: KeyframeManager;
  private loopClosureDetector: LoopClosureDetector | null = null;
  private frameCount = 0;

  constructor(
    private map: SLAMMapManager,
    private config: Required<SLAMConfig>,
    private intrinsics: CameraIntrinsics
  ) {
    this.keyframeManager = new KeyframeManager(config);

    // Initialize loop closure if enabled
    if (config.enableLoopClosure) {
      this.loopClosureDetector = new LoopClosureDetector(map, {
        minInterval: config.loopClosureMinInterval,
        similarityThreshold: config.loopClosureThreshold,
      });
      this.logger.info(' Loop closure detection enabled');
    }
  }

  /**
   * Initialize map with first keyframe
   *
   * @param context Initial frame data
   * @returns First keyframe
   */
  initializeMap(context: KeyframeCreationContext): Keyframe {
    const { timestamp, pose, keypoints, descriptors } = context;

    this.logger.info(' Initializing map with first keyframe');

    // Create first keyframe
    const keyframe = this.map.addKeyframe({
      timestamp,
      pose: this.createKeyframePose(pose),
      features: this.createFeatures(keypoints, descriptors),
      covisibleKeyframes: [],
      mapPoints: [],
      intrinsics: this.intrinsics,
    });

    this.keyframeManager.registerKeyframe(keyframe);

    // Add to loop closure detector
    if (this.loopClosureDetector) {
      this.loopClosureDetector.addKeyframe(keyframe);
    }

    console.log(`[SLAMMapper] Map initialized with keyframe #${keyframe.id}`);

    return keyframe;
  }

  /**
   * Try to create a new keyframe
   *
   * @param context Current frame data
   * @returns New keyframe if created, null otherwise
   */
  tryCreateKeyframe(context: KeyframeCreationContext): Keyframe | null {
    this.frameCount++;

    const { timestamp, pose, keypoints, descriptors, numTrackedFeatures } = context;

    // Create keyframe candidate
    const candidate: KeyframeCandidate = {
      timestamp,
      pose: this.createKeyframePose(pose),
      features: this.createFeatures(keypoints, descriptors),
    };

    // Check if we should create a keyframe
    if (!this.keyframeManager.shouldCreateKeyframe(candidate, numTrackedFeatures)) {
      return null;
    }

    // Create keyframe
    const keyframe = this.map.addKeyframe({
      timestamp: candidate.timestamp,
      pose: candidate.pose,
      features: candidate.features,
      covisibleKeyframes: [],
      mapPoints: [],
      intrinsics: this.intrinsics,
    });

    this.keyframeManager.registerKeyframe(keyframe);

    console.log(
      `[SLAMMapper] Created keyframe #${keyframe.id} (${numTrackedFeatures} features tracked)`
    );

    // Loop closure detection
    if (this.loopClosureDetector) {
      this.detectLoopClosures(keyframe);
    }

    return keyframe;
  }

  /**
   * Detect loop closures for a keyframe
   */
  private detectLoopClosures(keyframe: Keyframe): void {
    if (!this.loopClosureDetector) return;

    // Add keyframe to loop closure database
    this.loopClosureDetector.addKeyframe(keyframe);

    // Detect loop closures
    const loopClosures = this.loopClosureDetector.detectLoopClosure(
      keyframe,
      this.frameCount
    );

    if (loopClosures.length > 0) {
      console.log(`[SLAMMapper] Detected ${loopClosures.length} loop closure(s)`);

      // TODO: Perform pose graph optimization
      // For now, just log the detection
      for (const loop of loopClosures) {
        console.log(
          `  - Keyframe ${loop.candidateKeyframeId}, similarity: ${loop.similarity.toFixed(3)}, matches: ${loop.matchCount}, inliers: ${loop.inliers}`
        );
      }
    }
  }

  /**
   * Get number of keyframes in map
   */
  getKeyframeCount(): number {
    return this.map.getAllKeyframes().length;
  }

  /**
   * Get number of map points in map
   */
  getMapPointCount(): number {
    return this.map.getAllMapPoints().length;
  }

  /**
   * Reset mapper state (for map loading)
   */
  reset(): void {
    this.keyframeManager.reset();
    this.frameCount = 0;

    // Re-register all keyframes from map
    const keyframes = this.map.getAllKeyframes();
    for (const keyframe of keyframes) {
      this.keyframeManager.registerKeyframe(keyframe);

      // Re-add to loop closure detector
      if (this.loopClosureDetector) {
        this.loopClosureDetector.addKeyframe(keyframe);
      }
    }

    console.log(`[SLAMMapper] Reset complete (${keyframes.length} keyframes)`);
  }

  /**
   * Update intrinsics
   */
  updateIntrinsics(intrinsics: CameraIntrinsics): void {
    this.intrinsics = intrinsics;
  }

  /**
   * Create keyframe pose from camera pose
   */
  private createKeyframePose(pose: CameraPose): KeyframePose {
    return {
      position: pose.position,
      rotation: pose.rotation,
      transform: Matrix4.identity(), // TODO: compute from position/rotation
      inverse: Matrix4.identity(),
    };
  }

  /**
   * Create keyframe features from keypoints and descriptors
   */
  private createFeatures(
    keypoints: Array<{ x: number; y: number; octave?: number; angle?: number }>,
    descriptors: Uint32Array | null
  ): KeyframeFeature[] {
    return keypoints.map((kp, i) => ({
      x: kp.x,
      y: kp.y,
      octave: kp.octave ?? 0,
      angle: kp.angle ?? 0,
      descriptor: descriptors
        ? new Uint8Array(descriptors.buffer, i * ORB_DESCRIPTOR_BYTES, ORB_DESCRIPTOR_BYTES)
        : new Uint8Array(ORB_DESCRIPTOR_BYTES),
      mapPointId: null,
    }));
  }
}
