/**
 * SLAM System
 * Main orchestrator for Visual SLAM
 * Coordinates tracking, mapping, and loop closure
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
  Keyframe,
  KeyframePose,
  KeyframeFeature,
} from './types';
import { SLAMMapManager } from './slam-map';
import { KeyframeManager, type KeyframeCandidate } from './keyframe-manager';
import { FeatureDetector } from '../detection/feature-detector';
import { PoseEstimator } from '../tracking/pose-estimator';
import { ExtendedKalmanFilter, type EKFState } from './extended-kalman-filter';
import { IMUManager } from './imu-manager';
import { MapStorage } from './map-storage';
import { LoopClosureDetector } from './loop-closure';
import { Matrix4 } from '../math/matrix';
import { Quaternion } from '../math/quaternion';
import { Vector3 } from '../math/vector';
import { generateId } from '../../utils/id-generator';

export class SLAMSystem {
  private gpuContext: GPUContextManager;
  private config: Required<SLAMConfig>;

  // Core components
  private map: SLAMMapManager;
  private keyframeManager: KeyframeManager;
  private featureDetector: FeatureDetector;
  private poseEstimator: PoseEstimator;

  // VIO components
  private ekf: ExtendedKalmanFilter | null = null;
  private imuManager: IMUManager | null = null;

  // Loop closure
  private loopClosureDetector: LoopClosureDetector | null = null;

  // Persistence
  private mapStorage: MapStorage | null = null;
  private mapId: string | null = null;
  private autosaveTimer: Timer | null = null;
  private lastSaveTime = 0;

  // State
  private state: SLAMState = 'not-initialized';
  private currentPose: CameraPose | null = null;
  private intrinsics: CameraIntrinsics | null = null;

  // Statistics
  private stats: SLAMStats;
  private frameCount = 0;
  private lastFPSUpdate = 0;
  private lastFPSFrameCount = 0;

  // IMU buffer (for VIO)
  private imuBuffer: IMUMeasurement[] = [];

  // Performance tracking
  private lastTrackingTime = 0;
  private lastMappingTime = 0;

  constructor(gpuContext: GPUContextManager, config: SLAMConfig = {}) {
    this.gpuContext = gpuContext;

    // Default configuration
    this.config = {
      minKeyframeTranslation: config.minKeyframeTranslation ?? 0.1,
      minKeyframeRotation: config.minKeyframeRotation ?? 0.2,
      minKeyframeInterval: config.minKeyframeInterval ?? 200,
      maxKeyframes: config.maxKeyframes ?? 100,
      maxFeatures: config.maxFeatures ?? 500,
      minFeatureTracked: config.minFeatureTracked ?? 50,
      minObservations: config.minObservations ?? 3,
      maxReprojectionError: config.maxReprojectionError ?? 3.0,
      useIMU: config.useIMU ?? false,
      imuFrequency: config.imuFrequency ?? 200,
      accelerometerNoise: config.accelerometerNoise ?? 0.1,
      gyroscopeNoise: config.gyroscopeNoise ?? 0.01,
      enableLoopClosure: config.enableLoopClosure ?? false,
      loopClosureMinInterval: config.loopClosureMinInterval ?? 100,
      loopClosureThreshold: config.loopClosureThreshold ?? 0.75,
      enablePersistence: config.enablePersistence ?? false,
      autosaveInterval: config.autosaveInterval ?? 30000,
      maxMapSize: config.maxMapSize ?? 10 * 1024 * 1024, // 10MB
      maxMappingTime: config.maxMappingTime ?? 20,
      localMappingThreads: config.localMappingThreads ?? 1,
    };

    // Initialize components
    this.map = new SLAMMapManager('AR Session Map');
    this.keyframeManager = new KeyframeManager(this.config);
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

    console.log('[SLAM System] Initialized');

    // Initialize loop closure if enabled
    if (this.config.enableLoopClosure) {
      this.loopClosureDetector = new LoopClosureDetector(this.map, {
        minInterval: this.config.loopClosureMinInterval,
        similarityThreshold: this.config.loopClosureThreshold,
      });
      console.log('[SLAM System] Loop closure detection enabled');
    }

    // Initialize map persistence if enabled
    if (this.config.enablePersistence) {
      this.initializePersistence();
    }
  }

  /**
   * Initialize map persistence
   */
  private async initializePersistence(): Promise<void> {
    try {
      this.mapStorage = new MapStorage({
        preferIndexedDB: true,
        enableCompression: true,
      });

      await this.mapStorage.initialize();

      // Setup auto-save timer if enabled
      if (this.config.autosaveInterval > 0) {
        this.autosaveTimer = setInterval(() => {
          this.autoSave();
        }, this.config.autosaveInterval);
      }

      console.log('[SLAM System] Map persistence initialized');
    } catch (error) {
      console.error('[SLAM System] Failed to initialize persistence:', error);
      this.config.enablePersistence = false;
    }
  }

  /**
   * Initialize Visual-Inertial Odometry
   */
  private async initializeVIO(): Promise<void> {
    console.log('[SLAM System] Initializing VIO...');

    // Check if IMU sensors are available
    const imuAvailable = await IMUManager.isAvailable();
    if (!imuAvailable) {
      console.warn('[SLAM System] IMU sensors not available, VIO disabled');
      this.config.useIMU = false;
      return;
    }

    try {
      // Create and configure IMU Manager
      this.imuManager = new IMUManager({
        frequency: this.config.imuFrequency,
        calibrationSamples: 100,
        enableAutoCalibration: true,
      });

      // Start IMU measurements
      await this.imuManager.start();

      // Initialize EKF with initial state
      const initialState: EKFState = {
        position: this.currentPose?.position ?? new Vector3(0, 0, 0),
        velocity: new Vector3(0, 0, 0),
        orientation: this.currentPose?.rotation ?? Quaternion.identity(),
        gyroBias: new Vector3(0, 0, 0),
        accelBias: new Vector3(0, 0, 0),
        timestamp: performance.now(),
      };

      this.ekf = new ExtendedKalmanFilter(initialState, {
        processNoise: {
          position: 0.01,
          velocity: 0.1,
          orientation: 0.01,
          gyroBias: 0.0001,
          accelBias: 0.001,
        },
        measurementNoise: {
          position: 0.02,
          velocity: 0.2,
        },
        imuNoise: {
          gyroscope: this.config.gyroscopeNoise,
          accelerometer: this.config.accelerometerNoise,
          gyroBiasDrift: 0.00001,
          accelBiasDrift: 0.0001,
        },
        gravity: new Vector3(0, -9.81, 0),
      });

      // Set up IMU measurement callback
      this.imuManager.onMeasurement((measurement) => {
        if (this.ekf && this.state === 'tracking') {
          const ekfState = this.ekf.getState();
          const dt = (measurement.timestamp - ekfState.timestamp) / 1000;

          // Predict using IMU measurements
          if (dt > 0 && dt < 0.1) { // Sanity check on dt
            this.ekf.predict(
              measurement.gyroscope,
              measurement.accelerometer,
              dt
            );
          }
        }
      });

      console.log('[SLAM System] VIO initialized successfully');
    } catch (error) {
      console.error('[SLAM System] Failed to initialize VIO:', error);
      this.config.useIMU = false;
      this.imuManager = null;
      this.ekf = null;
    }
  }

  /**
   * Initialize SLAM system
   */
  async initialize(width: number, height: number, intrinsics?: CameraIntrinsics): Promise<void> {
    if (this.state !== 'not-initialized') {
      console.warn('[SLAM System] Already initialized');
      return;
    }

    console.log('[SLAM System] Initializing...');

    // Initialize feature detector
    await this.featureDetector.initialize(width, height);

    // Set camera intrinsics
    const estimatedIntrinsics = PoseEstimator.estimateIntrinsics(width, height);
    this.intrinsics = intrinsics ?? estimatedIntrinsics;
    this.poseEstimator.updateIntrinsics(this.intrinsics);

    this.state = 'initializing';
    this.stats.state = this.state;

    console.log('[SLAM System] Ready for initialization');

    // Initialize VIO if enabled
    if (this.config.useIMU) {
      await this.initializeVIO();
    }
  }

  /**
   * Process frame
   * Main SLAM tracking and mapping
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

    // Track based on current state
    let result: TrackingResult;

    if (this.state === 'initializing') {
      result = await this.initializeMap(keypoints, descriptors, timestamp);
    } else if (this.state === 'tracking') {
      result = await this.trackFrame(keypoints, descriptors, timestamp);
    } else if (this.state === 'lost') {
      result = await this.relocalize(keypoints, descriptors, timestamp);
    } else {
      // Fallback
      result = {
        success: false,
        pose: this.currentPose ?? this.createDefaultPose(timestamp),
        numTrackedFeatures: 0,
        numInliers: 0,
        reprojectionError: Infinity,
        state: this.state,
      };
    }

    // Update stats
    this.lastTrackingTime = performance.now() - trackingStart;
    this.stats.lastFrameTrackingTime = this.lastTrackingTime;
    this.stats.numTrackedFeatures = result.numTrackedFeatures;
    this.stats.state = result.state;
    this.updateFPS();

    this.frameCount++;

    return result;
  }

  /**
   * Initialize map (first few frames)
   */
  private async initializeMap(
    keypoints: any[],
    descriptors: Uint32Array | null,
    timestamp: number
  ): Promise<TrackingResult> {
    console.log('[SLAM] Initializing map...');

    // Create first keyframe at origin
    const initialPose: KeyframePose = {
      position: new Vector3(0, 0, 0),
      rotation: Quaternion.identity(),
      transform: Matrix4.identity(),
      inverse: Matrix4.identity(),
    };

    const features: KeyframeFeature[] = keypoints.map((kp, i) => ({
      x: kp.x,
      y: kp.y,
      octave: kp.octave ?? 0,
      angle: kp.angle ?? 0,
      descriptor: descriptors
        ? new Uint8Array(descriptors.buffer, i * 32, 32)
        : new Uint8Array(32),
      mapPointId: null,
    }));

    const keyframe = this.map.addKeyframe({
      timestamp,
      pose: initialPose,
      features,
      covisibleKeyframes: [],
      mapPoints: [],
      intrinsics: this.intrinsics!,
    });

    this.keyframeManager.registerKeyframe(keyframe);

    this.currentPose = {
      position: initialPose.position,
      rotation: initialPose.rotation,
      velocity: new Vector3(0, 0, 0),
      angularVelocity: new Vector3(0, 0, 0),
      timestamp,
    };

    this.state = 'tracking';
    this.stats.numKeyframes = 1;

    // Initialize EKF state if VIO is enabled
    if (this.ekf) {
      const ekfState: EKFState = {
        position: this.currentPose.position,
        velocity: new Vector3(0, 0, 0),
        orientation: this.currentPose.rotation,
        gyroBias: this.imuManager?.getBiases().gyro ?? new Vector3(0, 0, 0),
        accelBias: this.imuManager?.getBiases().accel ?? new Vector3(0, 0, 0),
        timestamp: this.currentPose.timestamp,
      };
      this.ekf.reset(ekfState, 0.1);
      console.log('[SLAM] EKF initialized with first keyframe pose');
    }

    console.log('[SLAM] Map initialized');

    return {
      success: true,
      pose: this.currentPose,
      numTrackedFeatures: keypoints.length,
      numInliers: keypoints.length,
      reprojectionError: 0,
      state: this.state,
    };
  }

  /**
   * Track frame against existing map
   */
  private async trackFrame(
    keypoints: any[],
    descriptors: Uint32Array | null,
    timestamp: number
  ): Promise<TrackingResult> {
    // Get last keyframe for matching
    const keyframes = this.map.getAllKeyframes();
    if (keyframes.length === 0) {
      return this.handleTrackingFailure(timestamp);
    }

    const lastKeyframe = keyframes[keyframes.length - 1];

    // Check if we have descriptors
    if (!descriptors || descriptors.length === 0) {
      console.warn('[SLAM] No descriptors provided for tracking');
      return this.handleTrackingFailure(timestamp);
    }

    // Match features with last keyframe
    const matches = this.matchFeatures(
      descriptors,
      lastKeyframe.features.map(f => f.descriptor)
    );

    if (matches.length < this.config.minFeatureTracked) {
      console.warn(`[SLAM] Tracking lost: only ${matches.length} matches found`);
      this.state = 'lost';
      return this.handleTrackingFailure(timestamp);
    }

    // TODO: Estimate pose using matched features and EPnP
    // For now, use last pose with small update
    if (!this.currentPose) {
      this.currentPose = {
        position: lastKeyframe.pose.position,
        rotation: lastKeyframe.pose.rotation,
        velocity: new Vector3(0, 0, 0),
        angularVelocity: new Vector3(0, 0, 0),
        timestamp,
      };
    }

    const numTracked = matches.length;

    // Create keyframe candidate
    const candidate: KeyframeCandidate = {
      timestamp,
      pose: {
        position: this.currentPose?.position ?? new Vector3(0, 0, 0),
        rotation: this.currentPose?.rotation ?? Quaternion.identity(),
        transform: Matrix4.identity(),
        inverse: Matrix4.identity(),
      },
      features: keypoints.map((kp, i) => ({
        x: kp.x,
        y: kp.y,
        octave: kp.octave ?? 0,
        angle: kp.angle ?? 0,
        descriptor: descriptors
          ? new Uint8Array(descriptors.buffer, i * 32, 32)
          : new Uint8Array(32),
        mapPointId: null,
      })),
    };

    // Check if we should create a keyframe
    if (this.keyframeManager.shouldCreateKeyframe(candidate, numTracked)) {
      const keyframe = this.map.addKeyframe({
        timestamp: candidate.timestamp,
        pose: candidate.pose,
        features: candidate.features,
        covisibleKeyframes: [],
        mapPoints: [],
        intrinsics: this.intrinsics!,
      });

      this.keyframeManager.registerKeyframe(keyframe);
      this.stats.numKeyframes = this.map.getAllKeyframes().length;

      console.log(`[SLAM] Created keyframe #${keyframe.id}`);

      // Loop closure detection
      if (this.loopClosureDetector) {
        // Add keyframe to loop closure database
        this.loopClosureDetector.addKeyframe(keyframe);

        // Detect loop closures
        const loopClosures = this.loopClosureDetector.detectLoopClosure(
          keyframe,
          this.frameCount
        );

        if (loopClosures.length > 0) {
          console.log(`[SLAM] Detected ${loopClosures.length} loop closure(s)`);
          // TODO: Perform pose graph optimization
          // For now, just log the detection
          for (const loop of loopClosures) {
            console.log(
              `  - Keyframe ${loop.candidateKeyframeId}, similarity: ${loop.similarity.toFixed(3)}, matches: ${loop.matchCount}, inliers: ${loop.inliers}`
            );
          }
        }
      }
    }

    // Update EKF with visual measurement (if VIO enabled)
    if (this.ekf && this.currentPose) {
      this.ekf.update(this.currentPose.position);

      // Get fused pose estimate from EKF
      const ekfState = this.ekf.getState();
      this.currentPose = {
        position: ekfState.position,
        rotation: ekfState.orientation,
        velocity: ekfState.velocity,
        angularVelocity: new Vector3(0, 0, 0), // TODO: compute from gyro
        timestamp,
      };
    }

    return {
      success: true,
      pose: this.currentPose!,
      numTrackedFeatures: numTracked,
      numInliers: numTracked,
      reprojectionError: 1.0,
      state: this.state,
    };
  }

  /**
   * Relocalize after tracking loss
   */
  private async relocalize(
    keypoints: any[],
    descriptors: Uint32Array | null,
    timestamp: number
  ): Promise<TrackingResult> {
    console.log('[SLAM] Attempting relocalization...');

    // TODO: Implement relocalization
    // For now, just fail

    return {
      success: false,
      pose: this.currentPose ?? this.createDefaultPose(timestamp),
      numTrackedFeatures: 0,
      numInliers: 0,
      reprojectionError: Infinity,
      state: this.state,
    };
  }

  /**
   * Add IMU measurement (for VIO)
   */
  addIMUMeasurement(measurement: IMUMeasurement): void {
    if (!this.config.useIMU) return;

    this.imuBuffer.push(measurement);

    // Keep only recent measurements (1 second)
    const cutoff = measurement.timestamp - 1000;
    this.imuBuffer = this.imuBuffer.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Get current pose
   */
  getCurrentPose(): CameraPose | null {
    return this.currentPose;
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
    const mapStats = this.map.getStats();

    return {
      ...this.stats,
      numKeyframes: mapStats.numKeyframes,
      numMapPoints: mapStats.numMapPoints,
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
    if (!this.mapStorage) {
      throw new Error('Map persistence not enabled');
    }

    // Generate ID if not provided
    const mapId = id ?? this.mapId ?? generateId();
    const mapName = name ?? this.map.getName() ?? `Map ${new Date().toISOString()}`;

    // Serialize map
    const serialized = this.map.serialize();

    // Check size limit
    const size = new Blob([JSON.stringify(serialized)]).size;
    if (size > this.config.maxMapSize) {
      throw new Error(`Map size (${size} bytes) exceeds limit (${this.config.maxMapSize} bytes)`);
    }

    // Save to storage
    await this.mapStorage.save(mapId, mapName, serialized);

    this.mapId = mapId;
    this.lastSaveTime = Date.now();

    console.log(`[SLAM System] Map saved: ${mapName} (${mapId})`);
    return mapId;
  }

  /**
   * Load map from storage
   */
  async loadMap(id: string): Promise<void> {
    if (!this.mapStorage) {
      throw new Error('Map persistence not enabled');
    }

    // Load from storage
    const serialized = await this.mapStorage.load(id);
    if (!serialized) {
      throw new Error(`Map not found: ${id}`);
    }

    // Deserialize and replace current map
    this.map = SLAMMapManager.deserialize(serialized);
    this.mapId = id;

    // Reset keyframe manager with loaded keyframes
    this.keyframeManager.reset();
    const keyframes = this.map.getAllKeyframes();
    for (const keyframe of keyframes) {
      this.keyframeManager.registerKeyframe(keyframe);
    }

    // Update state
    if (keyframes.length > 0) {
      const lastKeyframe = keyframes[keyframes.length - 1];
      this.currentPose = {
        position: lastKeyframe.pose.position,
        rotation: lastKeyframe.pose.rotation,
        velocity: new Vector3(0, 0, 0),
        angularVelocity: new Vector3(0, 0, 0),
        timestamp: lastKeyframe.timestamp,
      };
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
    if (!this.mapStorage) {
      throw new Error('Map persistence not enabled');
    }

    await this.mapStorage.delete(id);
    console.log(`[SLAM System] Map deleted: ${id}`);
  }

  /**
   * List all saved maps
   */
  async listMaps(): Promise<Array<{ id: string; name: string; timestamp: number; size: number }>> {
    if (!this.mapStorage) {
      throw new Error('Map persistence not enabled');
    }

    return await this.mapStorage.list();
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    count: number;
    totalSize: number;
    storageType: 'indexeddb' | 'localstorage';
  }> {
    if (!this.mapStorage) {
      throw new Error('Map persistence not enabled');
    }

    return await this.mapStorage.getStats();
  }

  /**
   * Auto-save map (called by timer)
   */
  private async autoSave(): Promise<void> {
    // Only auto-save if tracking and not recently saved
    if (this.state !== 'tracking') {
      return;
    }

    const now = Date.now();
    if (now - this.lastSaveTime < this.config.autosaveInterval) {
      return;
    }

    try {
      await this.saveMap();
      console.log('[SLAM System] Auto-save completed');
    } catch (error) {
      console.error('[SLAM System] Auto-save failed:', error);
    }
  }

  /**
   * Reset SLAM system
   */
  reset(): void {
    this.map.clear();
    this.keyframeManager.reset();
    this.state = 'initializing';
    this.currentPose = null;
    this.frameCount = 0;
    this.imuBuffer = [];

    // Reset EKF but keep IMU running
    if (this.ekf && this.imuManager) {
      const initialState: EKFState = {
        position: new Vector3(0, 0, 0),
        velocity: new Vector3(0, 0, 0),
        orientation: Quaternion.identity(),
        gyroBias: this.imuManager.getBiases().gyro,
        accelBias: this.imuManager.getBiases().accel,
        timestamp: performance.now(),
      };
      this.ekf.reset(initialState, 0.1);
    }

    console.log('[SLAM System] Reset');
  }

  /**
   * Dispose SLAM system and cleanup resources
   */
  dispose(): void {
    // Stop auto-save timer
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }

    // Close map storage
    if (this.mapStorage) {
      this.mapStorage.close();
      this.mapStorage = null;
    }

    // Stop IMU
    if (this.imuManager) {
      this.imuManager.stop();
      this.imuManager = null;
    }

    this.ekf = null;
    this.map.clear();
    this.keyframeManager.reset();

    console.log('[SLAM System] Disposed');
  }

  /**
   * Create default pose
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
   * Update FPS counter
   */
  private updateFPS(): void {
    const now = performance.now();

    if (now - this.lastFPSUpdate >= 1000) {
      const frames = this.frameCount - this.lastFPSFrameCount;
      const elapsed = now - this.lastFPSUpdate;

      this.stats.fps = Math.round((frames * 1000) / elapsed);
      this.lastFPSUpdate = now;
      this.lastFPSFrameCount = this.frameCount;
    }
  }

  /**
   * Match features using descriptor distance
   * Returns matches that pass ratio test (Lowe's ratio)
   */
  private matchFeatures(
    descriptors1: Uint32Array,
    descriptors2: Uint8Array[]
  ): Array<{ queryIdx: number; trainIdx: number; distance: number }> {
    const matches: Array<{ queryIdx: number; trainIdx: number; distance: number }> = [];
    const numDescriptors1 = descriptors1.length / 8; // 8 uint32s per descriptor (256 bits)

    for (let i = 0; i < numDescriptors1; i++) {
      const descriptor1 = new Uint8Array(descriptors1.buffer, i * 32, 32);

      let bestDist = Infinity;
      let secondBest = Infinity;
      let bestIdx = -1;

      // Find best and second-best matches
      for (let j = 0; j < descriptors2.length; j++) {
        const dist = this.hammingDistance(descriptor1, descriptors2[j]);

        if (dist < bestDist) {
          secondBest = bestDist;
          bestDist = dist;
          bestIdx = j;
        } else if (dist < secondBest) {
          secondBest = dist;
        }
      }

      // Apply ratio test (Lowe's ratio) - reject ambiguous matches
      const ratioThreshold = 0.8;
      if (bestDist < ratioThreshold * secondBest && bestDist < 50) {
        matches.push({
          queryIdx: i,
          trainIdx: bestIdx,
          distance: bestDist,
        });
      }
    }

    return matches;
  }

  /**
   * Compute Hamming distance between two binary descriptors
   */
  private hammingDistance(desc1: Uint8Array, desc2: Uint8Array): number {
    let distance = 0;
    const len = Math.min(desc1.length, desc2.length);

    for (let i = 0; i < len; i++) {
      // Count set bits in XOR (population count)
      let xor = desc1[i] ^ desc2[i];
      while (xor) {
        distance += xor & 1;
        xor >>= 1;
      }
    }

    return distance;
  }

  /**
   * Handle tracking failure
   */
  private handleTrackingFailure(timestamp: number): TrackingResult {
    this.state = 'lost';
    return {
      success: false,
      pose: this.currentPose ?? this.createDefaultPose(timestamp),
      numTrackedFeatures: 0,
      numInliers: 0,
      reprojectionError: Infinity,
      state: this.state,
    };
  }
}
