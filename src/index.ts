/**
 * BabylonJS AR Library
 * High-performance WebGPU AR with marker tracking and plane detection
 */

// Core exports
export { AREngine, type AREngineConfig, type ARFrame } from './core/engine';
export { GPUContextManager, type GPUContextConfig } from './core/gpu/gpu-context';
export {
  ComputePipeline,
  type ComputePipelineConfig,
  type BindGroupEntry,
  calculateWorkgroupCount,
  alignBufferSize,
} from './core/gpu/compute-pipeline';
export { CameraManager, type CameraConfig, type CameraFrame } from './core/camera/camera-manager';

// Tracking and detection
export {
  Tracker,
  type TrackerConfig,
  type TrackedMarker,
} from './core/tracking/tracker';
export {
  MarkerDetector,
  type MarkerDetectorConfig,
  type DetectedMarker,
  type MarkerCorners,
} from './core/detection/marker-detector';
export {
  PoseEstimator,
  type CameraIntrinsics,
  type Pose,
} from './core/tracking/pose-estimator';
export { KalmanFilter } from './core/tracking/kalman-filter';

// Math utilities
export { Matrix4 } from './core/math/matrix';
export { Vector3 } from './core/math/vector';
export { Quaternion } from './core/math/quaternion';
export { Homography } from './core/math/homography';

// Detection utilities
export { ContourProcessor, type Point, type Contour, type Quad } from './core/detection/contour-processor';
export { ArucoDecoder, type DictionarySize, type MarkerBits, type DecodedMarker } from './core/detection/aruco-decoder';

// Version
export const VERSION = '0.2.0';
