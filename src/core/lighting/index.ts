/**
 * Light Estimation Module
 * Exports all lighting-related functionality
 */

export { LightEstimator } from './light-estimator';
export type {
  RGB,
  LightEstimate,
  LightEstimatorConfig,
} from './light-estimator';

export { SphericalHarmonics } from './spherical-harmonics';
export type { SHCoefficients } from './spherical-harmonics';

export { BabylonLightingIntegration } from './babylon-integration';
