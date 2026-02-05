/**
 * AR Framework Constants
 * Centralized configuration values and magic numbers with meaningful names
 */

// ============================================================================
// Feature Matching Constants
// ============================================================================

/** Maximum Hamming distance for valid feature match (bits) */
export const FEATURE_MATCH_DISTANCE_THRESHOLD = 50;

/** Lowe's ratio test threshold for robust matching (lower = stricter) */
export const FEATURE_MATCH_RATIO_TEST_THRESHOLD = 0.8;

/** ORB descriptor size in bytes (256 bits) */
export const ORB_DESCRIPTOR_BYTES = 32;

/** ORB descriptor size in uint32 elements (8 × 4 bytes = 32 bytes) */
export const ORB_DESCRIPTOR_UINT32_SIZE = 8;

// ============================================================================
// SLAM Tracking Constants
// ============================================================================

/** Number of recent keyframes to search during relocalization */
export const RELOCALIZATION_KEYFRAME_SEARCH_COUNT = 10;

/** Default reprojection error for tracking (pixels) */
export const DEFAULT_REPROJECTION_ERROR = 1.0;

/** Reprojection error threshold for relocalization (pixels) */
export const RELOCALIZATION_REPROJECTION_ERROR = 2.0;

/** IMU measurement buffer time window (milliseconds) */
export const IMU_BUFFER_TIME_WINDOW_MS = 1000;

/** Maximum time delta for IMU integration (seconds) */
export const IMU_MAX_TIME_DELTA_SEC = 1.0;

// ============================================================================
// SLAM Configuration Defaults
// ============================================================================

/** Minimum translation for keyframe creation (meters) */
export const DEFAULT_MIN_KEYFRAME_TRANSLATION = 0.1;

/** Minimum rotation for keyframe creation (radians) */
export const DEFAULT_MIN_KEYFRAME_ROTATION = 0.2;

/** Minimum time between keyframes (milliseconds) */
export const DEFAULT_MIN_KEYFRAME_INTERVAL = 200;

/** Maximum number of keyframes in map */
export const DEFAULT_MAX_KEYFRAMES = 100;

/** Maximum features per frame */
export const DEFAULT_MAX_FEATURES = 500;

/** Minimum features to maintain tracking */
export const DEFAULT_MIN_FEATURES_TRACKED = 50;

/** Minimum observations for map point triangulation */
export const DEFAULT_MIN_OBSERVATIONS = 3;

/** Maximum reprojection error for inliers (pixels) */
export const DEFAULT_MAX_REPROJECTION_ERROR = 3.0;

/** IMU sampling frequency (Hz) */
export const DEFAULT_IMU_FREQUENCY = 200;

/** Accelerometer measurement noise (m/s²) */
export const DEFAULT_ACCELEROMETER_NOISE = 0.1;

/** Gyroscope measurement noise (rad/s) */
export const DEFAULT_GYROSCOPE_NOISE = 0.01;

/** Loop closure minimum interval (frames) */
export const DEFAULT_LOOP_CLOSURE_MIN_INTERVAL = 100;

/** Loop closure similarity threshold (0-1) */
export const DEFAULT_LOOP_CLOSURE_THRESHOLD = 0.75;

/** Map autosave interval (milliseconds) */
export const DEFAULT_AUTOSAVE_INTERVAL = 30000;

/** Maximum map size in storage (bytes) - 10MB */
export const DEFAULT_MAX_MAP_SIZE = 10 * 1024 * 1024;

/** Maximum mapping time per frame (milliseconds) */
export const DEFAULT_MAX_MAPPING_TIME = 20;

/** Number of local mapping threads */
export const DEFAULT_LOCAL_MAPPING_THREADS = 1;

// ============================================================================
// Extended Kalman Filter Constants
// ============================================================================

/** EKF process noise - position (m) */
export const EKF_PROCESS_NOISE_POSITION = 0.01;

/** EKF process noise - velocity (m/s) */
export const EKF_PROCESS_NOISE_VELOCITY = 0.1;

/** EKF process noise - orientation (rad) */
export const EKF_PROCESS_NOISE_ORIENTATION = 0.01;

/** EKF process noise - gyro bias (rad/s) */
export const EKF_PROCESS_NOISE_GYRO_BIAS = 0.0001;

/** EKF process noise - accel bias (m/s²) */
export const EKF_PROCESS_NOISE_ACCEL_BIAS = 0.001;

/** EKF measurement noise - position (m) */
export const EKF_MEASUREMENT_NOISE_POSITION = 0.1;

/** EKF measurement noise - velocity (m/s) */
export const EKF_MEASUREMENT_NOISE_VELOCITY = 0.1;

// ============================================================================
// Camera Intrinsics Estimation
// ============================================================================

/** Default horizontal field of view for camera calibration (degrees) */
export const DEFAULT_CAMERA_FOV_DEGREES = 60;

/** Default horizontal field of view for camera calibration (radians) */
export const DEFAULT_CAMERA_FOV_RADIANS = DEFAULT_CAMERA_FOV_DEGREES * (Math.PI / 180);

// ============================================================================
// EPnP Constants
// ============================================================================

/** Maximum iterations for EPnP null space computation */
export const EPNP_MAX_ITERATIONS = 100;

/** Convergence tolerance for EPnP iterative solver */
export const EPNP_CONVERGENCE_TOLERANCE = 1e-6;

/** Diagonal shift for numerical stability in EPnP */
export const EPNP_DIAGONAL_SHIFT = 1e-3;

/** Minimum determinant for valid matrix in EPnP */
export const EPNP_MIN_DETERMINANT = 1e-10;

// ============================================================================
// RANSAC Constants
// ============================================================================

/** Maximum RANSAC iterations for robust estimation */
export const RANSAC_MAX_ITERATIONS = 1000;

/** RANSAC inlier threshold (pixels) */
export const RANSAC_INLIER_THRESHOLD = 3.0;

/** RANSAC confidence level (0-1) */
export const RANSAC_CONFIDENCE = 0.99;

/** Minimum inlier ratio for valid RANSAC solution */
export const RANSAC_MIN_INLIER_RATIO = 0.3;

// ============================================================================
// Feature Detection Constants
// ============================================================================

/** FAST corner detection threshold */
export const FAST_THRESHOLD = 20;

/** FAST non-maximum suppression window size */
export const FAST_NMS_WINDOW = 3;

/** ORB number of pyramid levels */
export const ORB_PYRAMID_LEVELS = 8;

/** ORB scale factor between pyramid levels */
export const ORB_SCALE_FACTOR = 1.2;

/** Minimum feature response for keypoint retention */
export const MIN_FEATURE_RESPONSE = 10.0;

// ============================================================================
// Plane Detection Constants
// ============================================================================

/** Minimum points required to fit a plane */
export const MIN_POINTS_FOR_PLANE = 100;

/** Plane fitting inlier distance threshold (meters) */
export const PLANE_INLIER_THRESHOLD = 0.02;

/** Maximum angle between plane normals for merging (degrees) */
export const PLANE_MERGE_ANGLE_THRESHOLD = 10;

/** Maximum distance between planes for merging (meters) */
export const PLANE_MERGE_DISTANCE_THRESHOLD = 0.05;

/** Minimum plane area to be considered valid (m²) */
export const MIN_PLANE_AREA = 0.1;

// ============================================================================
// Marker Detection Constants
// ============================================================================

/** Minimum marker size in pixels */
export const MIN_MARKER_SIZE_PIXELS = 50;

/** Maximum marker size in pixels */
export const MAX_MARKER_SIZE_PIXELS = 1000;

/** Marker corner refinement window size */
export const MARKER_CORNER_REFINE_WINDOW = 5;

/** Minimum marker detection confidence (0-1) */
export const MIN_MARKER_CONFIDENCE = 0.5;

// ============================================================================
// Performance Constants
// ============================================================================

/** FPS measurement update interval (milliseconds) */
export const FPS_UPDATE_INTERVAL_MS = 1000;

/** GPU operation timeout (milliseconds) */
export const GPU_OPERATION_TIMEOUT_MS = 5000;

/** Maximum frame processing time (milliseconds) */
export const MAX_FRAME_PROCESSING_TIME_MS = 33; // ~30 fps

// ============================================================================
// Memory Management Constants
// ============================================================================

/** Maximum number of stored maps */
export const MAX_STORED_MAPS = 10;

/** IMU calibration sample count */
export const IMU_CALIBRATION_SAMPLES = 100;

/** Maximum texture cache size (bytes) */
export const MAX_TEXTURE_CACHE_SIZE = 100 * 1024 * 1024; // 100MB

// ============================================================================
// Depth Estimation Constants
// ============================================================================

/** Stereo matching window size */
export const STEREO_WINDOW_SIZE = 15;

/** Maximum stereo disparity search range */
export const MAX_STEREO_DISPARITY = 64;

/** Depth bilateral filter sigma (spatial) */
export const DEPTH_BILATERAL_SIGMA_SPATIAL = 3.0;

/** Depth bilateral filter sigma (range) */
export const DEPTH_BILATERAL_SIGMA_RANGE = 0.1;

// ============================================================================
// Lighting Estimation Constants
// ============================================================================

/** Spherical harmonics order (L2 = 9 coefficients) */
export const SPHERICAL_HARMONICS_ORDER = 2;

/** Number of SH coefficients per color channel */
export const SPHERICAL_HARMONICS_COEFFICIENTS = 9;

/** Light estimation update interval (milliseconds) */
export const LIGHT_ESTIMATION_UPDATE_INTERVAL_MS = 100;

// ============================================================================
// Network Constants (Future Use)
// ============================================================================

/** Network request timeout (milliseconds) */
export const NETWORK_TIMEOUT_MS = 10000;

/** Maximum retry attempts for failed requests */
export const MAX_RETRY_ATTEMPTS = 3;

/** Retry backoff multiplier */
export const RETRY_BACKOFF_MULTIPLIER = 2.0;
