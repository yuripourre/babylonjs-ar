/**
 * Kalman Filter
 * Smooths pose estimates for stable AR tracking
 */

import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import type { Pose } from './pose-estimator';

interface KalmanState {
  // State vector: [position, velocity]
  position: Vector3;
  velocity: Vector3;
  rotation: Quaternion;
  angularVelocity: Vector3;

  // Covariance matrix (simplified as scalars for each component)
  positionCovariance: number;
  velocityCovariance: number;
  rotationCovariance: number;
}

export class KalmanFilter {
  private state: KalmanState;
  private processNoise: number;
  private measurementNoise: number;
  private lastUpdateTime: number;

  constructor(
    processNoise: number = 0.01,
    measurementNoise: number = 0.1
  ) {
    this.processNoise = processNoise;
    this.measurementNoise = measurementNoise;
    this.lastUpdateTime = performance.now();

    // Initialize state
    this.state = {
      position: new Vector3(0, 0, 0),
      velocity: new Vector3(0, 0, 0),
      rotation: Quaternion.identity(),
      angularVelocity: new Vector3(0, 0, 0),
      positionCovariance: 1.0,
      velocityCovariance: 1.0,
      rotationCovariance: 1.0,
    };
  }

  /**
   * Initialize filter with first measurement
   */
  initialize(pose: Pose): void {
    this.state.position = pose.position.clone();
    this.state.rotation = pose.rotation.clone();
    this.state.velocity = new Vector3(0, 0, 0);
    this.state.angularVelocity = new Vector3(0, 0, 0);
    this.lastUpdateTime = performance.now();
  }

  /**
   * Predict next state based on motion model
   */
  predict(): void {
    const now = performance.now();
    const dt = (now - this.lastUpdateTime) / 1000; // Convert to seconds

    if (dt <= 0) {return;}

    // Constant velocity model
    this.state.position = this.state.position.add(this.state.velocity.multiply(dt));

    // Increase covariance (uncertainty grows over time)
    this.state.positionCovariance += this.processNoise * dt;
    this.state.velocityCovariance += this.processNoise * dt;
    this.state.rotationCovariance += this.processNoise * dt * 0.1;

    this.lastUpdateTime = now;
  }

  /**
   * Update state with new measurement
   */
  update(measurement: Pose): void {
    // Kalman gain calculation (simplified)
    const positionGain = this.state.positionCovariance /
      (this.state.positionCovariance + this.measurementNoise);

    const rotationGain = this.state.rotationCovariance /
      (this.state.rotationCovariance + this.measurementNoise * 0.1);

    // Update position
    const positionError = measurement.position.subtract(this.state.position);
    this.state.position = this.state.position.add(positionError.multiply(positionGain));

    // Update velocity estimate
    const now = performance.now();
    const dt = (now - this.lastUpdateTime) / 1000;
    if (dt > 0) {
      this.state.velocity = positionError.multiply(1.0 / dt);
    }

    // Update rotation using SLERP
    this.state.rotation = this.state.rotation.slerp(measurement.rotation, rotationGain);

    // Update covariance
    this.state.positionCovariance *= (1 - positionGain);
    this.state.rotationCovariance *= (1 - rotationGain);

    // Prevent covariance from becoming too small
    this.state.positionCovariance = Math.max(this.state.positionCovariance, 0.001);
    this.state.rotationCovariance = Math.max(this.state.rotationCovariance, 0.001);

    this.lastUpdateTime = now;
  }

  /**
   * Get current filtered pose
   */
  getPose(): Pose {
    return {
      position: this.state.position.clone(),
      rotation: this.state.rotation.clone(),
      matrix: this.buildMatrix(this.state.position, this.state.rotation),
    };
  }

  /**
   * Build transformation matrix
   */
  private buildMatrix(position: Vector3, rotation: Quaternion): any {
    // This would use Matrix4 to build the transform
    // For now, return a simple object
    return {
      position: position.toArray(),
      rotation: rotation.toArray(),
    };
  }

  /**
   * Get position uncertainty (standard deviation)
   */
  getPositionUncertainty(): number {
    return Math.sqrt(this.state.positionCovariance);
  }

  /**
   * Get rotation uncertainty (standard deviation)
   */
  getRotationUncertainty(): number {
    return Math.sqrt(this.state.rotationCovariance);
  }

  /**
   * Reset filter
   */
  reset(): void {
    this.state = {
      position: new Vector3(0, 0, 0),
      velocity: new Vector3(0, 0, 0),
      rotation: Quaternion.identity(),
      angularVelocity: new Vector3(0, 0, 0),
      positionCovariance: 1.0,
      velocityCovariance: 1.0,
      rotationCovariance: 1.0,
    };
    this.lastUpdateTime = performance.now();
  }
}
