/**
 * SLAM Module
 * Visual Simultaneous Localization and Mapping
 */

export { SLAMSystem } from './slam-system';
export { SLAMMapManager } from './slam-map';
export { KeyframeManager } from './keyframe-manager';
export { ExtendedKalmanFilter } from './extended-kalman-filter';
export { IMUManager } from './imu-manager';
export { MapStorage } from './map-storage';
export { LoopClosureDetector } from './loop-closure';

export type {
  SLAMConfig,
  SLAMState,
  SLAMStats,
  TrackingResult,
  CameraPose,
  CameraIntrinsics,
  IMUMeasurement,
  Keyframe,
  KeyframePose,
  KeyframeFeature,
  MapPoint,
  SLAMMap,
  LoopClosureCandidate,
  SerializedMap,
} from './types';

export type { KeyframeCandidate } from './keyframe-manager';
export type { EKFState, EKFConfig } from './extended-kalman-filter';
export type { IMUManagerConfig } from './imu-manager';
export type { StorageConfig, StoredMap } from './map-storage';
export type { LoopClosureConfig } from './loop-closure';
