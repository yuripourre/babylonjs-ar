/**
 * Feature Detection Shaders
 * Export WGSL shader code for FAST, ORB, and feature matching
 */

import fastCornersShader from './features/fast-corners.wgsl';
import orbDescriptorShader from './features/orb-descriptor.wgsl';
import featureMatchingShader from './features/feature-matching.wgsl';
import orientationShader from './features/orientation.wgsl';

export const featureShaders = {
  fastCorners: fastCornersShader,
  orbDescriptor: orbDescriptorShader,
  featureMatching: featureMatchingShader,
  orientation: orientationShader,
};

export { fastCornersShader, orbDescriptorShader, featureMatchingShader, orientationShader };
