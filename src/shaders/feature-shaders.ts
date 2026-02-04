/**
 * Feature Detection Shaders
 * Exports WGSL shader code for FAST, ORB, and feature matching
 */

export const fastCornersShader = `
// FAST Corner Detection - see fast-corners.wgsl for full implementation
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // Placeholder - load from file in production
}
`;

export const orbDescriptorShader = `
// ORB Descriptor - see orb-descriptor.wgsl for full implementation
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // Placeholder - load from file in production
}
`;

export const featureMatchingShader = `
// Feature Matching - see feature-matching.wgsl for full implementation
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // Placeholder - load from file in production
}
`;
