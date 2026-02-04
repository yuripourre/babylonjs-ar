// ORB (Oriented FAST and Rotated BRIEF) Descriptor
// Computes 256-bit binary descriptor for each keypoint
// Rotation invariant using intensity centroid

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var keypointsBuffer: array<vec4<f32>>; // x, y, angle, response
@group(0) @binding(2) var descriptorsBuffer: array<u32>; // 256 bits = 8 u32s per descriptor
@group(0) @binding(3) var<uniform> params: ORBParams;

struct ORBParams {
  numKeypoints: u32,
  patchSize: u32, // 31 typical
  _padding: vec2<f32>,
}

// ORB sampling pattern (256 pairs, pre-rotated)
// Simplified subset for demonstration
const numPairs = 256u;

// Generate test pattern (normally loaded from precomputed)
fn getTestPair(idx: u32) -> vec4<i32> {
  // Returns (x1, y1, x2, y2) for pair comparison
  // This would normally be a large pre-computed array
  let angle = f32(idx) * 6.2831853 / 256.0;
  let radius = 15.0;

  let x1 = i32(cos(angle) * radius);
  let y1 = i32(sin(angle) * radius);
  let x2 = i32(cos(angle + 3.14159) * radius);
  let y2 = i32(sin(angle + 3.14159) * radius);

  return vec4<i32>(x1, y1, x2, y2);
}

// Rotate point around origin
fn rotatePoint(p: vec2<i32>, angle: f32) -> vec2<i32> {
  let c = cos(angle);
  let s = sin(angle);

  let x = f32(p.x) * c - f32(p.y) * s;
  let y = f32(p.x) * s + f32(p.y) * c;

  return vec2<i32>(i32(round(x)), i32(round(y)));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let keypointIdx = global_id.x;

  if (keypointIdx >= params.numKeypoints) {
    return;
  }

  // Get keypoint
  let kp = keypointsBuffer[keypointIdx];
  let center = vec2<i32>(i32(kp.x), i32(kp.y));
  let angle = kp.z;

  let dims = textureDimensions(inputTexture);

  // Check bounds
  let halfPatch = i32(params.patchSize) / 2;
  if (center.x < halfPatch || center.x >= i32(dims.x) - halfPatch ||
      center.y < halfPatch || center.y >= i32(dims.y) - halfPatch) {
    // Mark as invalid
    for (var i = 0u; i < 8u; i++) {
      descriptorsBuffer[keypointIdx * 8u + i] = 0u;
    }
    return;
  }

  // Compute descriptor
  var descriptor: array<u32, 8>;

  for (var pairIdx = 0u; pairIdx < numPairs; pairIdx++) {
    let pair = getTestPair(pairIdx);

    // Rotate sampling points
    let p1 = rotatePoint(vec2<i32>(pair.x, pair.y), angle);
    let p2 = rotatePoint(vec2<i32>(pair.z, pair.w), angle);

    // Sample intensities
    let coord1 = center + p1;
    let coord2 = center + p2;

    let intensity1 = textureLoad(inputTexture, coord1, 0).r;
    let intensity2 = textureLoad(inputTexture, coord2, 0).r;

    // Binary test
    let bit = u32(intensity1 < intensity2);

    // Pack into u32 (32 bits per u32, 8 u32s total)
    let wordIdx = pairIdx / 32u;
    let bitIdx = pairIdx % 32u;

    descriptor[wordIdx] |= bit << bitIdx;
  }

  // Write descriptor
  for (var i = 0u; i < 8u; i++) {
    descriptorsBuffer[keypointIdx * 8u + i] = descriptor[i];
  }
}
