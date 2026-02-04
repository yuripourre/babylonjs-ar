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
export {
  IndirectDispatch,
  type IndirectDispatchConfig,
} from './core/gpu/indirect-dispatch';
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
export {
  FeatureDetector,
  type FeatureDetectorConfig,
  type Keypoint,
  type FeatureMatch,
} from './core/detection/feature-detector';
export {
  PlaneDetector,
  type PlaneConfig,
  type DetectedPlane,
} from './core/detection/plane-detector';
export {
  PointCloudGenerator,
  type Point3D,
} from './core/detection/point-cloud';

// Estimation
export {
  LightEstimator,
  type LightEstimate,
  type LightEstimatorConfig,
} from './core/estimation/light-estimator';
export {
  OcclusionHandler,
  type OcclusionConfig,
} from './core/estimation/occlusion-handler';

// Utils
export {
  PerformanceMonitor,
  type PerformanceMetrics,
  type PerformanceConfig,
} from './utils/performance-monitor';
export {
  AdaptiveQuality,
  type QualitySettings,
  type PerformanceMetrics as AdaptivePerformanceMetrics,
} from './utils/adaptive-quality';
export {
  TemporalCoherence,
  type TrackedMarker as TemporalTrackedMarker,
  type TrackedPlane,
  type TrackedFeature,
  type TemporalConfig,
} from './utils/temporal-coherence';
export { KDTree } from './utils/kdtree';

// Shaders
export { planeShaders } from './shaders/plane-shaders';
export { depthShaders } from './shaders/depth-shaders';
export { lightingShaders } from './shaders/lighting-shaders';

// Developer Experience
export {
  ARBuilder,
  type ARPreset,
  type AREventHandlers,
} from './core/ar-builder';
export {
  ARDebug,
  createDebugOverlay,
  type DebugConfig,
} from './utils/ar-debug';
export {
  ARError,
  ARErrors,
  diagnoseEnvironment,
  printDiagnostics,
  withErrorHandling,
} from './utils/ar-errors';

// Version
export const VERSION = '0.6.0'; // Developer Experience improvements
