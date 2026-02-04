// Keypoint Orientation Computation
// Computes dominant orientation using intensity centroid
// Makes ORB descriptors rotation invariant

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> keypoints: array<vec4<f32>>; // x, y, response, octave
@group(0) @binding(2) var<storage, read_write> orientedKeypoints: array<vec4<f32>>; // x, y, angle, response
@group(0) @binding(3) var<uniform> params: OrientationParams;

struct OrientationParams {
  numKeypoints: u32,
  patchRadius: u32, // Typically 15
  _padding: vec2<f32>,
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let keypointIdx = global_id.x;

  if (keypointIdx >= params.numKeypoints) {
    return;
  }

  let kp = keypoints[keypointIdx];
  let center = vec2<i32>(i32(kp.x), i32(kp.y));
  let dims = textureDimensions(inputTexture);

  // Check bounds
  let radius = i32(params.patchRadius);
  if (center.x < radius || center.x >= i32(dims.x) - radius ||
      center.y < radius || center.y >= i32(dims.y) - radius) {
    // Copy without orientation
    orientedKeypoints[keypointIdx] = vec4<f32>(kp.x, kp.y, 0.0, kp.z);
    return;
  }

  // Compute intensity centroid
  var m01 = 0.0; // moment y
  var m10 = 0.0; // moment x
  var m00 = 0.0; // moment sum

  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      // Circular patch
      let dist = sqrt(f32(dx * dx + dy * dy));
      if (dist > f32(radius)) {
        continue;
      }

      let coord = center + vec2<i32>(dx, dy);
      let intensity = textureLoad(inputTexture, coord, 0).r;

      m10 += f32(dx) * intensity;
      m01 += f32(dy) * intensity;
      m00 += intensity;
    }
  }

  // Compute angle
  var angle = 0.0;
  if (m00 > 0.0) {
    angle = atan2(m01 / m00, m10 / m00);
  }

  // Store oriented keypoint
  orientedKeypoints[keypointIdx] = vec4<f32>(kp.x, kp.y, angle, kp.z);
}
