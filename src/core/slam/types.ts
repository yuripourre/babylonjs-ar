/**
 * SLAM Types and Interfaces
 * Core data structures for Visual SLAM system
 */

import type { Matrix4 } from '../math/matrix';
import type { Quaternion } from '../math/quaternion';
import type { Vector3 } from '../math/vector';

/**
 * 3D Point in the map
 */
export interface MapPoint {
  id: number;
  position: Vector3;
  descriptor: Uint8Array; // ORB descriptor (32 bytes)
  observations: number[]; // Keyframe IDs that observe this point
  normal: Vector3; // Average viewing direction
  minDistance: number; // Min viewing distance
  maxDistance: number; // Max viewing distance
  trackingState: 'good' | 'tentative' | 'bad';
  createdAt: number;
}

/**
 * Keyframe in the map
 */
export interface Keyframe {
  id: number;
  timestamp: number;
  pose: KeyframePose;
  features: KeyframeFeature[];
  imageData?: ImageData; // Optional: for visualization/loop closure
  covisibleKeyframes: number[]; // Keyframe IDs with shared map points
  mapPoints: number[]; // Map point IDs visible in this keyframe
  intrinsics: CameraIntrinsics;
}

/**
 * Keyframe pose (camera position and orientation)
 */
export interface KeyframePose {
  position: Vector3;
  rotation: Quaternion;
  transform: Matrix4; // World-to-camera transform
  inverse: Matrix4; // Camera-to-world transform
}

/**
 * Feature in a keyframe
 */
export interface KeyframeFeature {
  x: number; // Pixel coordinates
  y: number;
  octave: number; // Scale octave
  angle: number; // Orientation
  descriptor: Uint8Array; // ORB descriptor
  mapPointId: number | null; // Associated 3D map point (null if unmatched)
}

/**
 * Camera intrinsics (compatible with PoseEstimator)
 */
export interface CameraIntrinsics {
  fx: number; // Focal length x
  fy: number; // Focal length y
  cx: number; // Principal point x
  cy: number; // Principal point y
  distortion?: number[]; // Distortion coefficients
}

/**
 * IMU measurement
 */
export interface IMUMeasurement {
  timestamp: number;
  accelerometer: Vector3; // m/s²
  gyroscope: Vector3; // rad/s
}

/**
 * Camera pose with velocity (for VIO)
 */
export interface CameraPose {
  position: Vector3;
  rotation: Quaternion;
  velocity: Vector3; // Linear velocity
  angularVelocity: Vector3; // Angular velocity
  timestamp: number;
}

/**
 * Loop closure candidate
 */
export interface LoopClosureCandidate {
  queryKeyframeId: number;
  candidateKeyframeId: number;
  similarity: number; // Bag-of-words similarity score
  matchCount: number; // Number of feature matches
  inliers: number; // Number of RANSAC inliers (geometric verification)
}

/**
 * SLAM Map
 */
export interface SLAMMap {
  id: string;
  name: string;
  keyframes: Map<number, Keyframe>;
  mapPoints: Map<number, MapPoint>;
  covisibilityGraph: Map<number, Set<number>>; // Keyframe connections
  createdAt: number;
  lastUpdatedAt: number;
  metadata: {
    version: string;
    description?: string;
    bounds?: {
      min: Vector3;
      max: Vector3;
    };
  };
}

/**
 * SLAM Configuration
 */
export interface SLAMConfig {
  // Keyframe selection
  minKeyframeTranslation?: number; // Minimum translation to create keyframe (meters)
  minKeyframeRotation?: number; // Minimum rotation to create keyframe (radians)
  minKeyframeInterval?: number; // Minimum time between keyframes (ms)
  maxKeyframes?: number; // Maximum number of keyframes (circular buffer)

  // Feature tracking
  maxFeatures?: number; // Maximum features per keyframe
  minFeatureTracked?: number; // Minimum features to maintain tracking

  // Map point management
  minObservations?: number; // Minimum observations to accept map point
  maxReprojectionError?: number; // Maximum reprojection error (pixels)

  // IMU integration (VIO)
  useIMU?: boolean;
  imuFrequency?: number; // Expected IMU frequency (Hz)
  accelerometerNoise?: number;
  gyroscopeNoise?: number;

  // Loop closure
  enableLoopClosure?: boolean;
  loopClosureMinInterval?: number; // Min frames between loop attempts
  loopClosureThreshold?: number; // Similarity threshold (0-1)

  // Map persistence
  enablePersistence?: boolean;
  autosaveInterval?: number; // Autosave interval (ms)
  maxMapSize?: number; // Maximum map size in bytes

  // Performance
  maxMappingTime?: number; // Max time for mapping per frame (ms)
  localMappingThreads?: number; // Number of Web Workers for local mapping
}

/**
 * SLAM State
 */
export type SLAMState =
  | 'not-initialized'
  | 'initializing'
  | 'tracking'
  | 'lost'
  | 'relocalized';

/**
 * SLAM Statistics
 */
export interface SLAMStats {
  state: SLAMState;
  numKeyframes: number;
  numMapPoints: number;
  numTrackedFeatures: number;
  lastFrameTrackingTime: number; // ms
  lastFrameMappingTime: number; // ms
  fps: number;
  driftEstimate: number; // Estimated drift in meters
}

/**
 * Tracking Result
 */
export interface TrackingResult {
  success: boolean;
  pose: CameraPose;
  numTrackedFeatures: number;
  numInliers: number;
  reprojectionError: number;
  state: SLAMState;
}

/**
 * Serialized Map (for persistence)
 */
export interface SerializedMap {
  version: string;
  map: {
    id: string;
    name: string;
    metadata: SLAMMap['metadata'];
    keyframes: Array<{
      id: number;
      timestamp: number;
      pose: {
        position: [number, number, number];
        rotation: [number, number, number, number]; // Quaternion (x, y, z, w)
      };
      features: Array<{
        x: number;
        y: number;
        octave: number;
        angle: number;
        descriptor: number[]; // Base64 encoded in actual storage
        mapPointId: number | null;
      }>;
      covisibleKeyframes: number[];
      mapPoints: number[];
    }>;
    mapPoints: Array<{
      id: number;
      position: [number, number, number];
      descriptor: number[]; // Base64 encoded
      observations: number[];
      normal: [number, number, number];
      minDistance: number;
      maxDistance: number;
      trackingState: MapPoint['trackingState'];
    }>;
  };
  compressed: boolean;
  checksum: string;
}
