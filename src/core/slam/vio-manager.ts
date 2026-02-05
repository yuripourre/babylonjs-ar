/**
 * VIO Manager
 * Handles Visual-Inertial Odometry: IMU integration and sensor fusion
 */

import type { SLAMConfig, CameraPose, IMUMeasurement } from './types';
import { ExtendedKalmanFilter, type EKFState } from './extended-kalman-filter';
import { IMUManager } from './imu-manager';
import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import {
  EKF_PROCESS_NOISE_POSITION,
  EKF_PROCESS_NOISE_VELOCITY,
  EKF_PROCESS_NOISE_ORIENTATION,
  EKF_PROCESS_NOISE_GYRO_BIAS,
  EKF_PROCESS_NOISE_ACCEL_BIAS,
  EKF_MEASUREMENT_NOISE_POSITION,
  EKF_MEASUREMENT_NOISE_VELOCITY,
  IMU_CALIBRATION_SAMPLES,
  IMU_MAX_TIME_DELTA_SEC,
} from '../constants';

/**
 * VIO Manager
 * Responsible for fusing visual and inertial measurements
 */
export class VIOManager {
  private ekf: ExtendedKalmanFilter;
  private imuManager: IMUManager;
  private initialized = false;
  private lastUpdateTime = 0;

  constructor(private config: Required<SLAMConfig>) {
    // Create initial EKF state
    const initialState: EKFState = {
      position: new Vector3(0, 0, 0),
      velocity: new Vector3(0, 0, 0),
      orientation: Quaternion.identity(),
      gyroBias: new Vector3(0, 0, 0),
      accelBias: new Vector3(0, 0, 0),
      timestamp: 0,
    };

    // Initialize EKF with initial state and config
    this.ekf = new ExtendedKalmanFilter(initialState, {
      processNoise: {
        position: EKF_PROCESS_NOISE_POSITION,
        velocity: EKF_PROCESS_NOISE_VELOCITY,
        orientation: EKF_PROCESS_NOISE_ORIENTATION,
        gyroBias: EKF_PROCESS_NOISE_GYRO_BIAS,
        accelBias: EKF_PROCESS_NOISE_ACCEL_BIAS,
      },
      measurementNoise: {
        position: EKF_MEASUREMENT_NOISE_POSITION,
        velocity: EKF_MEASUREMENT_NOISE_VELOCITY,
      },
    });

    // Initialize IMU manager
    this.imuManager = new IMUManager({
      frequency: config.imuFrequency,
      calibrationSamples: IMU_CALIBRATION_SAMPLES,
      enableAutoCalibration: true,
    });
  }

  /**
   * Initialize VIO system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[VIOManager] Already initialized');
      return;
    }

    try {
      // Start IMU manager (request permissions, start reading sensors)
      await this.imuManager.start();

      // Set up measurement callback
      this.imuManager.onMeasurement((measurement) => {
        this.handleIMUMeasurement(measurement);
      });

      this.initialized = true;
      this.lastUpdateTime = performance.now();

      console.log('[VIOManager] VIO initialized successfully');
    } catch (error) {
      console.error('[VIOManager] Failed to initialize VIO:', error);
      throw error;
    }
  }

  /**
   * Handle IMU measurement from sensor
   */
  private handleIMUMeasurement(measurement: IMUMeasurement): void {
    const now = performance.now();
    const dt = (now - this.lastUpdateTime) / 1000; // Convert to seconds

    if (dt <= 0 || dt > IMU_MAX_TIME_DELTA_SEC) {
      // Skip invalid time deltas
      this.lastUpdateTime = now;
      return;
    }

    // Predict using IMU
    this.ekf.predict(
      measurement.gyroscope,
      measurement.accelerometer,
      dt
    );

    this.lastUpdateTime = now;
  }

  /**
   * Add IMU measurement to buffer (for external IMU data)
   *
   * @param measurement IMU data (accelerometer + gyroscope)
   */
  addIMUMeasurement(measurement: IMUMeasurement): void {
    if (!this.initialized) return;

    // Process measurement directly
    this.handleIMUMeasurement(measurement);
  }

  /**
   * Fuse visual pose with IMU measurements
   * Returns fused pose estimate
   *
   * @param visualPose Pose from visual tracking
   * @returns Fused camera pose
   */
  fusePose(visualPose: CameraPose): CameraPose {
    if (!this.initialized) {
      return visualPose;
    }

    // Update EKF with visual measurement
    this.ekf.update(visualPose.position);

    // Get fused estimate from EKF
    const ekfState = this.ekf.getState();

    // Return fused pose
    return {
      position: ekfState.position,
      rotation: ekfState.orientation,
      velocity: ekfState.velocity,
      angularVelocity: new Vector3(0, 0, 0), // TODO: compute from gyroscope
      timestamp: visualPose.timestamp,
    };
  }

  /**
   * Get current EKF state
   */
  getState(): EKFState {
    return this.ekf.getState();
  }

  /**
   * Check if VIO is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset VIO state
   */
  reset(): void {
    const initialState: EKFState = {
      position: new Vector3(0, 0, 0),
      velocity: new Vector3(0, 0, 0),
      orientation: Quaternion.identity(),
      gyroBias: new Vector3(0, 0, 0),
      accelBias: new Vector3(0, 0, 0),
      timestamp: 0,
    };

    this.ekf = new ExtendedKalmanFilter(initialState, {
      processNoise: {
        position: EKF_PROCESS_NOISE_POSITION,
        velocity: EKF_PROCESS_NOISE_VELOCITY,
        orientation: EKF_PROCESS_NOISE_ORIENTATION,
        gyroBias: EKF_PROCESS_NOISE_GYRO_BIAS,
        accelBias: EKF_PROCESS_NOISE_ACCEL_BIAS,
      },
      measurementNoise: {
        position: EKF_MEASUREMENT_NOISE_POSITION,
        velocity: EKF_MEASUREMENT_NOISE_VELOCITY,
      },
    });

    this.lastUpdateTime = performance.now();

    console.log('[VIOManager] VIO state reset');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.imuManager.stop();
    this.initialized = false;

    console.log('[VIOManager] VIO destroyed');
  }
}
