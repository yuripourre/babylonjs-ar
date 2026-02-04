// Normal Estimation Shader
// Estimates surface normals from depth or feature points
// Uses local neighborhood analysis

@group(0) @binding(0) var depthTexture: texture_2d<f32>;
@group(0) @binding(1) var outputNormals: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> params: NormalParams;

struct NormalParams {
  width: u32,
  height: u32,
  depthScale: f32,
  kernelSize: u32, // Typically 3 or 5
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(depthTexture);

  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let center = vec2<i32>(global_id.xy);
  let radius = i32(params.kernelSize) / 2;

  // Skip borders
  if (center.x < radius || center.x >= i32(dims.x) - radius ||
      center.y < radius || center.y >= i32(dims.y) - radius) {
    textureStore(outputNormals, center, vec4<f32>(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Get center depth
  let centerDepth = textureLoad(depthTexture, center, 0).r;

  if (centerDepth <= 0.0 || centerDepth >= 1.0) {
    // Invalid depth
    textureStore(outputNormals, center, vec4<f32>(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Compute normal using cross product of gradients
  // Get neighboring points
  let left = center + vec2<i32>(-1, 0);
  let right = center + vec2<i32>(1, 0);
  let top = center + vec2<i32>(0, -1);
  let bottom = center + vec2<i32>(0, 1);

  let leftDepth = textureLoad(depthTexture, left, 0).r;
  let rightDepth = textureLoad(depthTexture, right, 0).r;
  let topDepth = textureLoad(depthTexture, top, 0).r;
  let bottomDepth = textureLoad(depthTexture, bottom, 0).r;

  // Check valid depths
  if (leftDepth <= 0.0 || rightDepth <= 0.0 ||
      topDepth <= 0.0 || bottomDepth <= 0.0) {
    textureStore(outputNormals, center, vec4<f32>(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Convert to 3D points
  let fx = f32(params.width) / 2.0;  // Simplified camera model
  let fy = f32(params.height) / 2.0;
  let cx = f32(params.width) / 2.0;
  let cy = f32(params.height) / 2.0;

  // Center point
  let centerX = (f32(center.x) - cx) * centerDepth / fx;
  let centerY = (f32(center.y) - cy) * centerDepth / fy;
  let centerZ = centerDepth;
  let p0 = vec3<f32>(centerX, centerY, centerZ);

  // Horizontal gradient point
  let rightX = (f32(right.x) - cx) * rightDepth / fx;
  let rightY = (f32(right.y) - cy) * rightDepth / fy;
  let rightZ = rightDepth;
  let p1 = vec3<f32>(rightX, rightY, rightZ);

  // Vertical gradient point
  let bottomX = (f32(bottom.x) - cx) * bottomDepth / fx;
  let bottomY = (f32(bottom.y) - cy) * bottomDepth / fy;
  let bottomZ = bottomDepth;
  let p2 = vec3<f32>(bottomX, bottomY, bottomZ);

  // Compute vectors
  let v1 = p1 - p0;
  let v2 = p2 - p0;

  // Cross product
  let normal = cross(v1, v2);
  let length = sqrt(dot(normal, normal));

  if (length > 0.0) {
    let normalized = normal / length;

    // Flip normal to point toward camera if needed
    let toCamera = -normalize(p0);
    let finalNormal = select(normalized, -normalized, dot(normalized, toCamera) < 0.0);

    textureStore(outputNormals, center, vec4<f32>(finalNormal, 1.0));
  } else {
    textureStore(outputNormals, center, vec4<f32>(0.0, 0.0, 0.0, 0.0));
  }
}
