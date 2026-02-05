/**
 * Natural Image Tracking Module
 * Exports natural image tracking components
 */

export {
  ReferenceImageStore,
  type ReferenceImage,
  type StoredReferenceImage,
  type ImagePyramid,
  type MultiScaleFeatures,
  type ScaleLevelFeatures,
} from './reference-image-store';

export {
  GeometricVerifier,
  Matrix3,
  type Point2D,
  type GeometricVerificationResult,
  type RANSACConfig,
} from './geometric-verifier';

export {
  NaturalImageTracker,
  type TrackedImage,
  type TrackingConfig,
} from './natural-image-tracker-simple';
