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
export {
  ResourceManager,
  ResourceGroup,
  globalResourceManager,
  type GPUResource,
  type ResourceMetadata,
  type ResourceStats,
} from './core/gpu/resource-manager';
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
  type PoseEstimatorConfig,
} from './core/tracking/pose-estimator';
export { KalmanFilter } from './core/tracking/kalman-filter';
export { EPnP, type EPnPResult } from './core/tracking/epnp';
export { Kabsch, type KabschResult } from './core/tracking/kabsch';
export { RANSACPose, estimatePoseRANSAC, type RANSACConfig, type RANSACResult } from './core/tracking/ransac-pose';
export { SubPixelRefine, refineCorners, type SubPixelConfig } from './core/tracking/subpixel-refine';

// Feature matching
export {
  FeatureMatcher,
  type FeatureMatch as FeatureMatchResult,
  type FeatureMatcherConfig,
} from './core/matching';

// Math utilities
export { Matrix4 } from './core/math/matrix';
export { Vector3 } from './core/math/vector';
export { Quaternion } from './core/math/quaternion';
export { Homography } from './core/math/homography';

// Detection utilities
export { ContourProcessor, type Point, type Contour, type Quad } from './core/detection/contour-processor';
export { ArucoDecoder, type DictionarySize, type MarkerBits, type DecodedMarker } from './core/detection/aruco-decoder';
export { getArucoDictionary, getDictionarySize, validateMarkerPattern, ARUCO_4X4_50, ARUCO_5X5_100, ARUCO_6X6_250 } from './core/detection/aruco-dictionaries';
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

// Depth estimation
export {
  DepthManager,
  type DepthConfig,
  type DepthFrame,
} from './core/depth/depth-manager';

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
export {
  Logger,
  ComponentLogger,
  PerformanceLogger,
  logger,
  LogLevel,
  type LogEntry,
  type LogHandler,
  type LoggerConfig,
} from './utils/logger';

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

// SLAM and VIO
export {
  SLAMSystem,
  SLAMMapManager,
  KeyframeManager,
  ExtendedKalmanFilter,
  IMUManager,
  MapStorage,
  LoopClosureDetector,
  type SLAMConfig,
  type SLAMState,
  type SLAMStats,
  type TrackingResult,
  type CameraPose,
  type IMUMeasurement,
  type Keyframe,
  type MapPoint,
  type EKFState,
  type EKFConfig,
  type IMUManagerConfig,
  type StorageConfig,
  type StoredMap,
  type LoopClosureConfig,
  type LoopClosureCandidate,
} from './core/slam';

// Framework Adapters
export {
  BabylonAR,
  createBabylonAR,
  type BabylonARConfig,
} from './adapters/babylon/babylon-ar';
export {
  ThreeAR,
  createThreeAR,
  type ThreeARConfig,
  type ThreeTypes,
} from './adapters/three/three-ar';

// Constants
export * from './core/constants';

// Version
export const VERSION = '0.22.0'; // Memory Management: GPU resource tracking and leak detection
