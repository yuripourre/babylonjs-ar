/**
 * SLAM System (Refactored)
 * Main facade that orchestrates tracking, mapping, VIO, and persistence
 *
 * Architecture:
 * - SLAMTracker: Frame-to-frame tracking and relocalization
 * - SLAMMapper: Map management and keyframe creation
 * - VIOManager: IMU integration and sensor fusion
 * - MapPersistenceManager: Map storage and retrieval
 */

import type { GPUContextManager } from '../gpu/gpu-context';
import type {
  SLAMConfig,
  SLAMState,
  SLAMStats,
  TrackingResult,
  CameraPose,
  CameraIntrinsics,
  IMUMeasurement,
} from './types';
import { SLAMMapManager } from './slam-map';
import { SLAMTracker, type TrackingContext } from './slam-tracker';
import { SLAMMapper, type KeyframeCreationContext } from './slam-mapper';
import { VIOManager } from './vio-manager';
import { MapPersistenceManager } from './map-persistence-manager';
import { FeatureDetector } from '../detection/feature-detector';
import { PoseEstimator } from '../tracking/pose-estimator';
import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import {
  DEFAULT_MIN_KEYFRAME_TRANSLATION,
  DEFAULT_MIN_KEYFRAME_ROTATION,
  DEFAULT_MIN_KEYFRAME_INTERVAL,
  DEFAULT_MAX_KEYFRAMES,
  DEFAULT_MAX_FEATURES,
  DEFAULT_MIN_FEATURES_TRACKED,
  DEFAULT_MIN_OBSERVATIONS,
  DEFAULT_MAX_REPROJECTION_ERROR,
  DEFAULT_IMU_FREQUENCY,
  DEFAULT_ACCELEROMETER_NOISE,
  DEFAULT_GYROSCOPE_NOISE,
  DEFAULT_LOOP_CLOSURE_MIN_INTERVAL,
  DEFAULT_LOOP_CLOSURE_THRESHOLD,
  DEFAULT_AUTOSAVE_INTERVAL,
  DEFAULT_MAX_MAP_SIZE,
  DEFAULT_MAX_MAPPING_TIME,
  DEFAULT_LOCAL_MAPPING_THREADS,
  DEFAULT_CAMERA_FOV_RADIANS,
} from '../constants';

export class SLAMSystem {
  private gpuContext: GPUContextManager;
  private config: Required<SLAMConfig>;

  // Core components (refactored into separate classes)
  private map: SLAMMapManager;
  private tracker: SLAMTracker;
  private mapper: SLAMMapper;
  private vio: VIOManager | null = null;
  private persistence: MapPersistenceManager | null = null;

  // Feature detection (still part of main system)
  private featureDetector: FeatureDetector;
  private poseEstimator: PoseEstimator;

  // State
  private state: SLAMState = 'not-initialized';
  private intrinsics: CameraIntrinsics | null = null;

  // Statistics
  private stats: SLAMStats;
  private frameCount = 0;
  private lastFPSUpdate = 0;
  private lastFPSFrameCount = 0;

  // Performance tracking
  private lastTrackingTime = 0;
  private lastMappingTime = 0;

  constructor(gpuContext: GPUContextManager, config: SLAMConfig = {}) {
    this.gpuContext = gpuContext;

    // Default configuration
    this.config = {
      minKeyframeTranslation: config.minKeyframeTranslation ?? DEFAULT_MIN_KEYFRAME_TRANSLATION,
      minKeyframeRotation: config.minKeyframeRotation ?? DEFAULT_MIN_KEYFRAME_ROTATION,
      minKeyframeInterval: config.minKeyframeInterval ?? DEFAULT_MIN_KEYFRAME_INTERVAL,
      maxKeyframes: config.maxKeyframes ?? DEFAULT_MAX_KEYFRAMES,
      maxFeatures: config.maxFeatures ?? DEFAULT_MAX_FEATURES,
      minFeatureTracked: config.minFeatureTracked ?? DEFAULT_MIN_FEATURES_TRACKED,
      minObservations: config.minObservations ?? DEFAULT_MIN_OBSERVATIONS,
      maxReprojectionError: config.maxReprojectionError ?? DEFAULT_MAX_REPROJECTION_ERROR,
      useIMU: config.useIMU ?? false,
      imuFrequency: config.imuFrequency ?? DEFAULT_IMU_FREQUENCY,
      accelerometerNoise: config.accelerometerNoise ?? DEFAULT_ACCELEROMETER_NOISE,
      gyroscopeNoise: config.gyroscopeNoise ?? DEFAULT_GYROSCOPE_NOISE,
      enableLoopClosure: config.enableLoopClosure ?? false,
      loopClosureMinInterval: config.loopClosureMinInterval ?? DEFAULT_LOOP_CLOSURE_MIN_INTERVAL,
      loopClosureThreshold: config.loopClosureThreshold ?? DEFAULT_LOOP_CLOSURE_THRESHOLD,
      enablePersistence: config.enablePersistence ?? false,
      autosaveInterval: config.autosaveInterval ?? DEFAULT_AUTOSAVE_INTERVAL,
      maxMapSize: config.maxMapSize ?? DEFAULT_MAX_MAP_SIZE,
      maxMappingTime: config.maxMappingTime ?? DEFAULT_MAX_MAPPING_TIME,
      localMappingThreads: config.localMappingThreads ?? DEFAULT_LOCAL_MAPPING_THREADS,
    };

    // Initialize map
    this.map = new SLAMMapManager('AR Session Map');

    // Initialize tracker (handles feature matching and pose estimation)
    this.tracker = new SLAMTracker(this.map, this.config);

    // Initialize mapper (handles keyframe creation and loop closure)
    // Will be fully initialized after intrinsics are set
    this.mapper = new SLAMMapper(
      this.map,
      this.config,
      { fx: 800, fy: 800, cx: 640, cy: 360 } // Placeholder
    );

    // Initialize feature detector
    this.featureDetector = new FeatureDetector(gpuContext, {
      maxKeypoints: this.config.maxFeatures,
    });

    // Placeholder pose estimator (will be updated with actual intrinsics)
    this.poseEstimator = new PoseEstimator({
      fx: 800, fy: 800, cx: 640, cy: 360,
    });

    // Initialize stats
    this.stats = {
      state: this.state,
      numKeyframes: 0,
      numMapPoints: 0,
      numTrackedFeatures: 0,
      lastFrameTrackingTime: 0,
      lastFrameMappingTime: 0,
      fps: 0,
      driftEstimate: 0,
    };

    console.log('[SLAM System] Initialized with refactored architecture');

    // Initialize VIO if enabled
    if (this.config.useIMU) {
      this.initializeVIO();
    }

    // Initialize persistence if enabled
    if (this.config.enablePersistence) {
      this.initializePersistence();
    }
  }

  /**
   * Initialize Visual-Inertial Odometry
   */
  private async initializeVIO(): Promise<void> {
    try {
      this.vio = new VIOManager(this.config);
      await this.vio.initialize();
      console.log('[SLAM System] VIO enabled');
    } catch (error) {
      console.warn('[SLAM System] VIO initialization failed, continuing without IMU:', error);
      this.vio = null;
    }
  }

  /**
   * Initialize map persistence
   */
  private async initializePersistence(): Promise<void> {
    try {
      this.persistence = new MapPersistenceManager(this.map, this.config);
      await this.persistence.initialize();
      console.log('[SLAM System] Map persistence enabled');
    } catch (error) {
      console.warn('[SLAM System] Persistence initialization failed:', error);
      this.persistence = null;
    }
  }

  /**
   * Initialize SLAM system with camera parameters
   */
  async initialize(width: number, height: number, intrinsics?: CameraIntrinsics): Promise<void> {
    // Set or estimate camera intrinsics
    if (intrinsics) {
      this.intrinsics = intrinsics;
    } else {
      // Estimate from image dimensions using default FOV
      const fx = width / (2 * Math.tan(DEFAULT_CAMERA_FOV_RADIANS / 2));
      const fy = fx;

      this.intrinsics = {
        fx,
        fy,
        cx: width / 2,
        cy: height / 2,
      };
    }

    // Update pose estimator with intrinsics
    this.poseEstimator = new PoseEstimator(this.intrinsics);

    // Update mapper with intrinsics
    this.mapper.updateIntrinsics(this.intrinsics);

    // Set state to initializing
    this.state = 'initializing';
    this.stats.state = this.state;

    console.log('[SLAM System] Initialized', {
      width,
      height,
      intrinsics: this.intrinsics,
    });
  }

  /**
   * Process a frame (main entry point)
   */
  async processFrame(
    grayscaleTexture: GPUTexture,
    timestamp: number
  ): Promise<TrackingResult> {
    const trackingStart = performance.now();

    // Detect features
    await this.featureDetector.detectAndCompute(grayscaleTexture);
    const keypoints = this.featureDetector.getKeypoints();
    const descriptors = this.featureDetector.getDescriptors();

    console.log(`[SLAM] Detected ${keypoints.length} features`);

    // Create tracking context
    const context: TrackingContext = {
      keypoints,
      descriptors,
      timestamp,
    };

    // Track based on current state
    let result: TrackingResult;

    if (this.state === 'initializing') {
      result = await this.initializeMap(context);
    } else if (this.state === 'tracking') {
      result = await this.track(context);
    } else if (this.state === 'lost') {
      result = await this.relocalize(context);
    } else {
      // Fallback
      result = this.createFailureResult(timestamp);
    }

    // Update state from tracking result
    this.state = result.state;

    // Update stats
    this.lastTrackingTime = performance.now() - trackingStart;
    this.stats.lastFrameTrackingTime = this.lastTrackingTime;
    this.stats.numTrackedFeatures = result.numTrackedFeatures;
    this.stats.state = result.state;
    this.stats.numKeyframes = this.mapper.getKeyframeCount();
    this.stats.numMapPoints = this.mapper.getMapPointCount();
    this.updateFPS();

    this.frameCount++;

    return result;
  }

  /**
   * Initialize map with first keyframe
   */
  private async initializeMap(context: TrackingContext): Promise<TrackingResult> {
    console.log('[SLAM] Initializing map...');

    // Create initial pose at origin
    const initialPose: CameraPose = {
      position: new Vector3(0, 0, 0),
      rotation: Quaternion.identity(),
      velocity: new Vector3(0, 0, 0),
      angularVelocity: new Vector3(0, 0, 0),
      timestamp: context.timestamp,
    };

    // Create first keyframe
    const keyframe = this.mapper.initializeMap({
      timestamp: context.timestamp,
      pose: initialPose,
      keypoints: context.keypoints,
      descriptors: context.descriptors,
      numTrackedFeatures: context.keypoints.length,
    });

    // Update tracker with initial pose
    this.tracker.updatePose(initialPose);

    // Transition to tracking state
    this.state = 'tracking';

    console.log(`[SLAM] Map initialized with keyframe #${keyframe.id}`);

    return {
      success: true,
      pose: initialPose,
      numTrackedFeatures: context.keypoints.length,
      numInliers: context.keypoints.length,
      reprojectionError: 0,
      state: 'tracking',
    };
  }

  /**
   * Track current frame
   */
  private async track(context: TrackingContext): Promise<TrackingResult> {
    // Track frame using SLAMTracker
    let result = await this.tracker.trackFrame(context);

    if (!result.success) {
      // Tracking failed, transition to lost
      this.state = 'lost';
      return result;
    }

    // Fuse with IMU if VIO enabled
    if (this.vio && this.vio.isInitialized()) {
      const fusedPose = this.vio.fusePose(result.pose);
      result.pose = fusedPose;
      this.tracker.updatePose(fusedPose);
    }

    // Try to create keyframe
    const keyframe = this.mapper.tryCreateKeyframe({
      timestamp: context.timestamp,
      pose: result.pose,
      keypoints: context.keypoints,
      descriptors: context.descriptors,
      numTrackedFeatures: result.numTrackedFeatures,
    });

    if (keyframe) {
      console.log(`[SLAM] Created keyframe #${keyframe.id}`);
    }

    return result;
  }

  /**
   * Relocalize after tracking loss
   */
  private async relocalize(context: TrackingContext): Promise<TrackingResult> {
    const result = await this.tracker.relocalize(context);

    if (result.success) {
      // Relocalization successful, return to tracking
      this.state = 'tracking';
      console.log('[SLAM] Relocalization successful');
    }

    return result;
  }

  /**
   * Add IMU measurement (for VIO)
   */
  addIMUMeasurement(measurement: IMUMeasurement): void {
    if (!this.vio) return;
    this.vio.addIMUMeasurement(measurement);
  }

  /**
   * Get current pose
   */
  getCurrentPose(): CameraPose | null {
    return this.tracker.getCurrentPose();
  }

  /**
   * Get map
   */
  getMap(): SLAMMapManager {
    return this.map;
  }

  /**
   * Get statistics
   */
  getStats(): SLAMStats {
    return {
      ...this.stats,
      numKeyframes: this.mapper.getKeyframeCount(),
      numMapPoints: this.mapper.getMapPointCount(),
    };
  }

  /**
   * Get state
   */
  getState(): SLAMState {
    return this.state;
  }

  /**
   * Save map to storage
   */
  async saveMap(name?: string, id?: string): Promise<string> {
    if (!this.persistence) {
      throw new Error('Map persistence not enabled');
    }

    return await this.persistence.saveMap(name, id);
  }

  /**
   * Load map from storage
   */
  async loadMap(id: string): Promise<void> {
    if (!this.persistence) {
      throw new Error('Map persistence not enabled');
    }

    // Load map
    const loadedMap = await this.persistence.loadMap(id);

    // Replace current map
    this.map = loadedMap;

    // Reset mapper with new map
    this.mapper = new SLAMMapper(this.map, this.config, this.intrinsics!);
    this.mapper.reset();

    // Reset tracker with new map
    this.tracker = new SLAMTracker(this.map, this.config);

    // Update state
    const keyframes = this.map.getAllKeyframes();
    if (keyframes.length > 0) {
      const lastKeyframe = keyframes[keyframes.length - 1];
      const pose: CameraPose = {
        position: lastKeyframe.pose.position,
        rotation: lastKeyframe.pose.rotation,
        velocity: new Vector3(0, 0, 0),
        angularVelocity: new Vector3(0, 0, 0),
        timestamp: lastKeyframe.timestamp,
      };
      this.tracker.updatePose(pose);
      this.state = 'tracking';
    } else {
      this.state = 'initializing';
    }

    console.log(`[SLAM System] Map loaded: ${id} (${keyframes.length} keyframes)`);
  }

  /**
   * Delete map from storage
   */
  async deleteMap(id: string): Promise<void> {
    if (!this.persistence) {
      throw new Error('Map persistence not enabled');
    }

    await this.persistence.deleteMap(id);
    console.log(`[SLAM System] Map deleted: ${id}`);
  }

  /**
   * List all stored maps
   */
  async listMaps(): Promise<Array<{ id: string; name: string; timestamp: number; size: number }>> {
    if (!this.persistence) {
      throw new Error('Map persistence not enabled');
    }

    return await this.persistence.listMaps();
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    used: number;
    available: number;
    numMaps: number;
  }> {
    if (!this.persistence) {
      throw new Error('Map persistence not enabled');
    }

    return await this.persistence.getStorageStats();
  }

  /**
   * Update FPS counter
   */
  private updateFPS(): void {
    const now = performance.now();

    if (now - this.lastFPSUpdate >= 1000) {
      const framesDelta = this.frameCount - this.lastFPSFrameCount;
      const timeDelta = (now - this.lastFPSUpdate) / 1000;
      this.stats.fps = framesDelta / timeDelta;

      this.lastFPSUpdate = now;
      this.lastFPSFrameCount = this.frameCount;
    }
  }

  /**
   * Create failure result
   */
  private createFailureResult(timestamp: number): TrackingResult {
    return {
      success: false,
      pose: this.tracker.getCurrentPose() ?? {
        position: new Vector3(0, 0, 0),
        rotation: Quaternion.identity(),
        velocity: new Vector3(0, 0, 0),
        angularVelocity: new Vector3(0, 0, 0),
        timestamp,
      },
      numTrackedFeatures: 0,
      numInliers: 0,
      reprojectionError: Infinity,
      state: this.state,
    };
  }
}
