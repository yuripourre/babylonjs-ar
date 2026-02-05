/**
 * Extended Kalman Filter for Visual-Inertial Odometry
 * Fuses visual tracking with IMU measurements
 *
 * State vector (15 dimensions):
 * - Position (3): x, y, z
 * - Velocity (3): vx, vy, vz
 * - Orientation (4): quaternion (qx, qy, qz, qw)
 * - Gyroscope bias (3): bg_x, bg_y, bg_z
 * - Accelerometer bias (3): ba_x, ba_y, ba_z
 *
 * This is a simplified EKF. Production systems use MSCKF or OKVIS.
 */

import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import { Matrix } from '../math/matrix-ops';

export interface EKFState {
  // Position in world frame (meters)
  position: Vector3;

  // Velocity in world frame (m/s)
  velocity: Vector3;

  // Orientation (world to body)
  orientation: Quaternion;

  // Gyroscope bias (rad/s)
  gyroBias: Vector3;

  // Accelerometer bias (m/s²)
  accelBias: Vector3;

  // Timestamp
  timestamp: number;
}

export interface EKFConfig {
  // Process noise (how much we trust the model)
  processNoise: {
    position: number;      // m
    velocity: number;      // m/s
    orientation: number;   // rad
    gyroBias: number;      // rad/s
    accelBias: number;     // m/s²
  };

  // Measurement noise (how much we trust measurements)
  measurementNoise: {
    position: number;      // m (from visual tracking)
    velocity: number;      // m/s (if available)
  };

  // IMU noise characteristics
  imuNoise: {
    gyroscope: number;     // rad/s
    accelerometer: number; // m/s²
    gyroBiasDrift: number; // rad/s²
    accelBiasDrift: number; // m/s³
  };

  // Gravity vector (m/s²)
  gravity: Vector3;
}

export class ExtendedKalmanFilter {
  private state: EKFState;
  private covariance: number[][]; // 15x15 covariance matrix
  private config: EKFConfig;

  // State dimension
  private readonly STATE_DIM = 15;

  constructor(initialState: EKFState, config: Partial<EKFConfig> = {}) {
    this.state = initialState;

    // Default configuration
    this.config = {
      processNoise: {
        position: config.processNoise?.position ?? 0.01,
        velocity: config.processNoise?.velocity ?? 0.1,
        orientation: config.processNoise?.orientation ?? 0.01,
        gyroBias: config.processNoise?.gyroBias ?? 0.0001,
        accelBias: config.processNoise?.accelBias ?? 0.001,
      },
      measurementNoise: {
        position: config.measurementNoise?.position ?? 0.01,
        velocity: config.measurementNoise?.velocity ?? 0.1,
      },
      imuNoise: {
        gyroscope: config.imuNoise?.gyroscope ?? 0.001,
        accelerometer: config.imuNoise?.accelerometer ?? 0.01,
        gyroBiasDrift: config.imuNoise?.gyroBiasDrift ?? 0.00001,
        accelBiasDrift: config.imuNoise?.accelBiasDrift ?? 0.0001,
      },
      gravity: config.gravity ?? new Vector3(0, -9.81, 0),
    };

    // Initialize covariance matrix (identity * initial uncertainty)
    this.covariance = Matrix.identity(this.STATE_DIM);
    this.scaleCovariance(0.1); // Initial uncertainty
  }

  /**
   * Prediction step using IMU measurements
   * Called at high frequency (100-200 Hz)
   */
  predict(
    gyroscope: Vector3,
    accelerometer: Vector3,
    dt: number
  ): void {
    // Remove bias from measurements
    const omega = gyroscope.subtract(this.state.gyroBias);
    const accel = accelerometer.subtract(this.state.accelBias);

    // Rotate acceleration to world frame
    const accelWorld = this.rotateByQuaternion(accel, this.state.orientation);

    // Add gravity
    const accelWithGravity = accelWorld.add(this.config.gravity);

    // Predict state (discrete integration)
    const newPosition = this.state.position.add(
      this.state.velocity.multiply(dt)
    ).add(
      accelWithGravity.multiply(0.5 * dt * dt)
    );

    const newVelocity = this.state.velocity.add(
      accelWithGravity.multiply(dt)
    );

    // Quaternion integration (using omega)
    const newOrientation = this.integrateQuaternion(
      this.state.orientation,
      omega,
      dt
    );

    // Bias remains constant (random walk model)
    const newGyroBias = this.state.gyroBias;
    const newAccelBias = this.state.accelBias;

    // Update state
    this.state = {
      position: newPosition,
      velocity: newVelocity,
      orientation: newOrientation.normalize(),
      gyroBias: newGyroBias,
      accelBias: newAccelBias,
      timestamp: this.state.timestamp + dt * 1000,
    };

    // Predict covariance: P = F*P*F' + Q
    this.predictCovariance(omega, accel, dt);
  }

  /**
   * Update step using visual measurements
   * Called at camera frame rate (30-60 Hz)
   */
  update(
    measuredPosition: Vector3,
    measuredVelocity?: Vector3
  ): void {
    // Innovation (measurement - prediction)
    const positionInnovation = measuredPosition.subtract(this.state.position);

    // Measurement matrix H (which states we're measuring)
    // We measure position (and optionally velocity)
    const H = this.createMeasurementMatrix(measuredVelocity !== undefined);

    // Innovation covariance: S = H*P*H' + R
    const S = this.computeInnovationCovariance(H);

    // Kalman gain: K = P*H' * inv(S)
    const K = this.computeKalmanGain(H, S);

    // Update state: x = x + K * innovation
    const innovation = [
      positionInnovation.x,
      positionInnovation.y,
      positionInnovation.z,
    ];

    if (measuredVelocity) {
      const velocityInnovation = measuredVelocity.subtract(this.state.velocity);
      innovation.push(
        velocityInnovation.x,
        velocityInnovation.y,
        velocityInnovation.z
      );
    }

    this.applyKalmanUpdate(K, innovation);

    // Update covariance: P = (I - K*H) * P
    this.updateCovariance(K, H);
  }

  /**
   * Get current state estimate
   */
  getState(): EKFState {
    return { ...this.state };
  }

  /**
   * Get covariance matrix (for debugging)
   */
  getCovariance(): number[][] {
    return this.covariance.map(row => [...row]);
  }

  /**
   * Get position uncertainty (standard deviation in meters)
   */
  getPositionUncertainty(): Vector3 {
    return new Vector3(
      Math.sqrt(this.covariance[0][0]),
      Math.sqrt(this.covariance[1][1]),
      Math.sqrt(this.covariance[2][2])
    );
  }

  /**
   * Reset filter with new state
   */
  reset(newState: EKFState, uncertainty: number = 0.1): void {
    this.state = newState;
    this.covariance = Matrix.identity(this.STATE_DIM);
    this.scaleCovariance(uncertainty);
  }

  // ==================== Private Methods ====================

  /**
   * Rotate vector by quaternion
   */
  private rotateByQuaternion(v: Vector3, q: Quaternion): Vector3 {
    // v' = q * v * q^-1
    const qv = new Quaternion(v.x, v.y, v.z, 0);
    const qInv = q.conjugate();
    const rotated = q.multiply(qv).multiply(qInv);

    return new Vector3(rotated.x, rotated.y, rotated.z);
  }

  /**
   * Integrate quaternion using angular velocity
   */
  private integrateQuaternion(q: Quaternion, omega: Vector3, dt: number): Quaternion {
    // First-order integration: q_new = q + 0.5 * q * [0, omega] * dt
    const omegaNorm = omega.length();

    if (omegaNorm < 1e-8) {
      // No rotation
      return q;
    }

    // Axis-angle to quaternion increment
    const halfAngle = 0.5 * omegaNorm * dt;
    const axis = omega.normalize();
    const sinHalf = Math.sin(halfAngle);

    const dq = new Quaternion(
      axis.x * sinHalf,
      axis.y * sinHalf,
      axis.z * sinHalf,
      Math.cos(halfAngle)
    );

    return q.multiply(dq);
  }

  /**
   * Predict covariance (simplified)
   */
  private predictCovariance(omega: Vector3, accel: Vector3, dt: number): void {
    // Process noise matrix Q
    const Q = this.createProcessNoiseMatrix(dt);

    // Simplified covariance prediction: P = P + Q
    // (Full EKF would use: P = F*P*F' + Q where F is the Jacobian)
    for (let i = 0; i < this.STATE_DIM; i++) {
      for (let j = 0; j < this.STATE_DIM; j++) {
        this.covariance[i][j] += Q[i][j];
      }
    }
  }

  /**
   * Create process noise matrix
   */
  private createProcessNoiseMatrix(dt: number): number[][] {
    const Q = Matrix.zeros(this.STATE_DIM, this.STATE_DIM);
    const dt2 = dt * dt;

    // Position noise
    for (let i = 0; i < 3; i++) {
      Q[i][i] = this.config.processNoise.position * dt2;
    }

    // Velocity noise
    for (let i = 3; i < 6; i++) {
      Q[i][i] = this.config.processNoise.velocity * dt2;
    }

    // Orientation noise
    for (let i = 6; i < 10; i++) {
      Q[i][i] = this.config.processNoise.orientation * dt2;
    }

    // Gyro bias noise
    for (let i = 10; i < 13; i++) {
      Q[i][i] = this.config.imuNoise.gyroBiasDrift * dt;
    }

    // Accel bias noise
    for (let i = 13; i < 15; i++) {
      Q[i][i] = this.config.imuNoise.accelBiasDrift * dt;
    }

    return Q;
  }

  /**
   * Create measurement matrix
   */
  private createMeasurementMatrix(includeVelocity: boolean): number[][] {
    const measDim = includeVelocity ? 6 : 3;
    const H = Matrix.zeros(measDim, this.STATE_DIM);

    // Measure position (indices 0-2)
    H[0][0] = 1;
    H[1][1] = 1;
    H[2][2] = 1;

    if (includeVelocity) {
      // Measure velocity (indices 3-5)
      H[3][3] = 1;
      H[4][4] = 1;
      H[5][5] = 1;
    }

    return H;
  }

  /**
   * Compute innovation covariance
   */
  private computeInnovationCovariance(H: number[][]): number[][] {
    // S = H*P*H' + R
    const HP = Matrix.multiply(H, this.covariance);
    const HPHt = Matrix.multiply(HP, Matrix.transpose(H));

    // Add measurement noise R
    const R = this.createMeasurementNoiseMatrix(H.length);
    return Matrix.add(HPHt, R);
  }

  /**
   * Create measurement noise matrix
   */
  private createMeasurementNoiseMatrix(measDim: number): number[][] {
    const R = Matrix.zeros(measDim, measDim);

    // Position noise
    for (let i = 0; i < 3; i++) {
      R[i][i] = this.config.measurementNoise.position * this.config.measurementNoise.position;
    }

    // Velocity noise (if measuring)
    if (measDim === 6) {
      for (let i = 3; i < 6; i++) {
        R[i][i] = this.config.measurementNoise.velocity * this.config.measurementNoise.velocity;
      }
    }

    return R;
  }

  /**
   * Compute Kalman gain
   */
  private computeKalmanGain(H: number[][], S: number[][]): number[][] {
    // K = P*H' * inv(S)
    const PHt = Matrix.multiply(this.covariance, Matrix.transpose(H));
    const SInv = Matrix.invert(S);
    return Matrix.multiply(PHt, SInv);
  }

  /**
   * Apply Kalman update to state
   */
  private applyKalmanUpdate(K: number[][], innovation: number[]): void {
    // Compute state correction: dx = K * innovation
    const dx = Matrix.multiplyVector(K, innovation);

    // Apply correction to state
    this.state.position = this.state.position.add(
      new Vector3(dx[0], dx[1], dx[2])
    );

    this.state.velocity = this.state.velocity.add(
      new Vector3(dx[3], dx[4], dx[5])
    );

    // Orientation update (quaternion)
    const dq = new Quaternion(dx[6], dx[7], dx[8], dx[9]);
    this.state.orientation = this.state.orientation.multiply(dq).normalize();

    // Bias updates
    this.state.gyroBias = this.state.gyroBias.add(
      new Vector3(dx[10], dx[11], dx[12])
    );

    this.state.accelBias = this.state.accelBias.add(
      new Vector3(dx[13], dx[14], 0)
    );
  }

  /**
   * Update covariance after measurement
   */
  private updateCovariance(K: number[][], H: number[][]): void {
    // P = (I - K*H) * P
    const KH = Matrix.multiply(K, H);
    const I = Matrix.identity(this.STATE_DIM);
    const IminusKH = Matrix.subtract(I, KH);
    this.covariance = Matrix.multiply(IminusKH, this.covariance);
  }

  /**
   * Scale entire covariance matrix
   */
  private scaleCovariance(scale: number): void {
    for (let i = 0; i < this.STATE_DIM; i++) {
      for (let j = 0; j < this.STATE_DIM; j++) {
        this.covariance[i][j] *= scale;
      }
    }
  }
}
