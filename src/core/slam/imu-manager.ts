/**
 * IMU Manager
 * Handles accelerometer and gyroscope data from Web APIs
 * Provides sensor fusion capabilities for VIO
 */

import { Vector3 } from '../math/vector';
import type { IMUMeasurement } from './types';

export interface IMUManagerConfig {
  frequency?: number; // Hz (default: 200)
  calibrationSamples?: number; // Number of samples for bias estimation
  enableAutoCalibration?: boolean; // Calibrate on start
}

export class IMUManager {
  private config: Required<IMUManagerConfig>;

  // Sensors
  private accelerometer: Accelerometer | null = null;
  private gyroscope: Gyroscope | null = null;

  // Latest measurements
  private latestAccel: Vector3 | null = null;
  private latestGyro: Vector3 | null = null;
  private lastTimestamp = 0;

  // Calibration (bias estimation)
  private accelBias = new Vector3(0, 0, 0);
  private gyroBias = new Vector3(0, 0, 0);
  private _isCalibrated = false;

  // Callback for new measurements
  private onMeasurementCallback: ((measurement: IMUMeasurement) => void) | null = null;

  // Status
  private isRunning = false;

  constructor(config: IMUManagerConfig = {}) {
    this.config = {
      frequency: config.frequency ?? 200,
      calibrationSamples: config.calibrationSamples ?? 100,
      enableAutoCalibration: config.enableAutoCalibration ?? true,
    };
  }

  /**
   * Check if IMU sensors are available
   */
  static async isAvailable(): Promise<boolean> {
    if (typeof Accelerometer === 'undefined' || typeof Gyroscope === 'undefined') {
      return false;
    }

    try {
      // Try to create sensors to check permissions
      const accel = new Accelerometer({ frequency: 1 });
      const gyro = new Gyroscope({ frequency: 1 });

      // Check if we can start them
      await new Promise<boolean>((resolve) => {
        let started = false;

        accel.addEventListener('reading', () => {
          if (!started) {
            started = true;
            accel.stop();
            gyro.stop();
            resolve(true);
          }
        });

        accel.addEventListener('error', () => {
          accel.stop();
          gyro.stop();
          resolve(false);
        });

        accel.start();
        gyro.start();

        // Timeout after 1 second
        setTimeout(() => {
          if (!started) {
            accel.stop();
            gyro.stop();
            resolve(false);
          }
        }, 1000);
      });

      return true;
    } catch (error) {
      console.warn('[IMU Manager] Sensors not available:', error);
      return false;
    }
  }

  /**
   * Start IMU measurements
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[IMU Manager] Already running');
      return;
    }

    try {
      // Create sensors
      this.accelerometer = new Accelerometer({
        frequency: this.config.frequency,
        referenceFrame: 'device', // Device frame (not screen)
      });

      this.gyroscope = new Gyroscope({
        frequency: this.config.frequency,
        referenceFrame: 'device',
      });

      // Setup event listeners
      this.accelerometer.addEventListener('reading', this.handleAccelerometerReading.bind(this));
      this.gyroscope.addEventListener('reading', this.handleGyroscopeReading.bind(this));

      this.accelerometer.addEventListener('error', (event: any) => {
        console.error('[IMU Manager] Accelerometer error:', event.error);
      });

      this.gyroscope.addEventListener('error', (event: any) => {
        console.error('[IMU Manager] Gyroscope error:', event.error);
      });

      // Start sensors
      this.accelerometer.start();
      this.gyroscope.start();

      this.isRunning = true;
      this.lastTimestamp = performance.now();

      console.log(`[IMU Manager] Started (${this.config.frequency} Hz)`);

      // Auto-calibration
      if (this.config.enableAutoCalibration) {
        await this.calibrate();
      }
    } catch (error) {
      console.error('[IMU Manager] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop IMU measurements
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.accelerometer?.stop();
    this.gyroscope?.stop();

    this.accelerometer = null;
    this.gyroscope = null;

    this.isRunning = false;

    console.log('[IMU Manager] Stopped');
  }

  /**
   * Calibrate sensors (estimate bias)
   * Device should be stationary during calibration
   */
  async calibrate(): Promise<void> {
    console.log(`[IMU Manager] Calibrating (${this.config.calibrationSamples} samples)...`);

    const accelSamples: Vector3[] = [];
    const gyroSamples: Vector3[] = [];

    // Collect samples
    await new Promise<void>((resolve) => {
      const collectSample = () => {
        if (this.latestAccel && this.latestGyro) {
          accelSamples.push(this.latestAccel);
          gyroSamples.push(this.latestGyro);

          if (accelSamples.length >= this.config.calibrationSamples) {
            resolve();
          } else {
            setTimeout(collectSample, 1000 / this.config.frequency);
          }
        } else {
          setTimeout(collectSample, 10);
        }
      };

      collectSample();
    });

    // Compute mean (bias)
    let accelSum = new Vector3(0, 0, 0);
    let gyroSum = new Vector3(0, 0, 0);

    for (const accel of accelSamples) {
      accelSum = accelSum.add(accel);
    }

    for (const gyro of gyroSamples) {
      gyroSum = gyroSum.add(gyro);
    }

    this.accelBias = accelSum.multiply(1 / accelSamples.length);
    this.gyroBias = gyroSum.multiply(1 / gyroSamples.length);

    // Subtract gravity from accelerometer bias (assuming device is stationary on horizontal surface)
    // Gravity is ~9.81 m/s² downward (device z-axis)
    this.accelBias = this.accelBias.subtract(new Vector3(0, 0, 9.81));

    this._isCalibrated = true;

    console.log(`[IMU Manager] Calibrated`);
    console.log(`  Accel bias: ${this.accelBias.toArray().map(v => v.toFixed(4)).join(', ')}`);
    console.log(`  Gyro bias: ${this.gyroBias.toArray().map(v => v.toFixed(4)).join(', ')}`);
  }

  /**
   * Get latest measurement
   */
  getLatestMeasurement(): IMUMeasurement | null {
    if (!this.latestAccel || !this.latestGyro) {
      return null;
    }

    return {
      timestamp: this.lastTimestamp,
      accelerometer: this.latestAccel.subtract(this.accelBias),
      gyroscope: this.latestGyro.subtract(this.gyroBias),
    };
  }

  /**
   * Set callback for new measurements
   */
  onMeasurement(callback: (measurement: IMUMeasurement) => void): void {
    this.onMeasurementCallback = callback;
  }

  /**
   * Get calibration status
   */
  isCalibrated(): boolean {
    return this._isCalibrated;
  }

  /**
   * Get sensor biases
   */
  getBiases(): { accel: Vector3; gyro: Vector3 } {
    return {
      accel: this.accelBias,
      gyro: this.gyroBias,
    };
  }

  /**
   * Manually set biases (if known from previous calibration)
   */
  setBiases(accelBias: Vector3, gyroBias: Vector3): void {
    this.accelBias = accelBias;
    this.gyroBias = gyroBias;
    this._isCalibrated = true;
  }

  // ==================== Private Methods ====================

  /**
   * Handle accelerometer reading
   */
  private handleAccelerometerReading(): void {
    if (!this.accelerometer) {return;}

    this.latestAccel = new Vector3(
      this.accelerometer.x ?? 0,
      this.accelerometer.y ?? 0,
      this.accelerometer.z ?? 0
    );

    this.tryPublishMeasurement();
  }

  /**
   * Handle gyroscope reading
   */
  private handleGyroscopeReading(): void {
    if (!this.gyroscope) {return;}

    this.latestGyro = new Vector3(
      this.gyroscope.x ?? 0,
      this.gyroscope.y ?? 0,
      this.gyroscope.z ?? 0
    );

    this.tryPublishMeasurement();
  }

  /**
   * Try to publish measurement (if both sensors have data)
   */
  private tryPublishMeasurement(): void {
    if (!this.latestAccel || !this.latestGyro) {
      return;
    }

    const now = performance.now();
    const timestamp = now;

    const measurement: IMUMeasurement = {
      timestamp,
      accelerometer: this.latestAccel.subtract(this.accelBias),
      gyroscope: this.latestGyro.subtract(this.gyroBias),
    };

    this.lastTimestamp = timestamp;

    // Invoke callback
    if (this.onMeasurementCallback) {
      this.onMeasurementCallback(measurement);
    }
  }
}
