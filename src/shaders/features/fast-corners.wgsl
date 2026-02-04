// FAST (Features from Accelerated Segment Test) Corner Detection
// Detects corners by comparing pixel intensity with circle of 16 pixels
// Threshold version: at least 12 contiguous pixels must be brighter or darker

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> params: FASTParams;

struct FASTParams {
  threshold: f32,
  nonMaxSuppression: u32,
  _padding: vec2<f32>,
}

// Bresenham circle offsets (radius 3)
const circleOffsets = array<vec2<i32>, 16>(
  vec2<i32>(0, 3),    // 0
  vec2<i32>(1, 3),    // 1
  vec2<i32>(2, 2),    // 2
  vec2<i32>(3, 1),    // 3
  vec2<i32>(3, 0),    // 4
  vec2<i32>(3, -1),   // 5
  vec2<i32>(2, -2),   // 6
  vec2<i32>(1, -3),   // 7
  vec2<i32>(0, -3),   // 8
  vec2<i32>(-1, -3),  // 9
  vec2<i32>(-2, -2),  // 10
  vec2<i32>(-3, -1),  // 11
  vec2<i32>(-3, 0),   // 12
  vec2<i32>(-3, 1),   // 13
  vec2<i32>(-2, 2),   // 14
  vec2<i32>(-1, 3),   // 15
);

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(inputTexture);

  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let center = vec2<i32>(global_id.xy);

  // Skip borders (radius 3)
  if (center.x < 3 || center.x >= i32(dims.x) - 3 ||
      center.y < 3 || center.y >= i32(dims.y) - 3) {
    textureStore(outputTexture, center, vec4<f32>(0.0));
    return;
  }

  // Get center intensity
  let centerIntensity = textureLoad(inputTexture, center, 0).r;

  // Fast rejection test: check 4 cardinal points
  let cardinalBrighter =
    (textureLoad(inputTexture, center + circleOffsets[0], 0).r > centerIntensity + params.threshold) &&
    (textureLoad(inputTexture, center + circleOffsets[4], 0).r > centerIntensity + params.threshold) &&
    (textureLoad(inputTexture, center + circleOffsets[8], 0).r > centerIntensity + params.threshold) &&
    (textureLoad(inputTexture, center + circleOffsets[12], 0).r > centerIntensity + params.threshold);

  let cardinalDarker =
    (textureLoad(inputTexture, center + circleOffsets[0], 0).r < centerIntensity - params.threshold) &&
    (textureLoad(inputTexture, center + circleOffsets[4], 0).r < centerIntensity - params.threshold) &&
    (textureLoad(inputTexture, center + circleOffsets[8], 0).r < centerIntensity - params.threshold) &&
    (textureLoad(inputTexture, center + circleOffsets[12], 0).r < centerIntensity - params.threshold);

  if (!cardinalBrighter && !cardinalDarker) {
    textureStore(outputTexture, center, vec4<f32>(0.0));
    return;
  }

  // Full circle test
  var brighterCount = 0u;
  var darkerCount = 0u;
  var maxBrighterSeq = 0u;
  var maxDarkerSeq = 0u;
  var currentBrighterSeq = 0u;
  var currentDarkerSeq = 0u;

  // Check twice to handle wrap-around
  for (var i = 0; i < 32; i++) {
    let idx = i % 16;
    let intensity = textureLoad(inputTexture, center + circleOffsets[idx], 0).r;

    if (intensity > centerIntensity + params.threshold) {
      brighterCount++;
      currentBrighterSeq++;
      currentDarkerSeq = 0u;
      maxBrighterSeq = max(maxBrighterSeq, currentBrighterSeq);
    } else if (intensity < centerIntensity - params.threshold) {
      darkerCount++;
      currentDarkerSeq++;
      currentBrighterSeq = 0u;
      maxDarkerSeq = max(maxDarkerSeq, currentDarkerSeq);
    } else {
      currentBrighterSeq = 0u;
      currentDarkerSeq = 0u;
    }
  }

  // Need at least 12 contiguous pixels
  let isCorner = maxBrighterSeq >= 12u || maxDarkerSeq >= 12u;

  if (isCorner) {
    // Compute corner score (sum of absolute differences)
    var score = 0.0;
    for (var i = 0; i < 16; i++) {
      let intensity = textureLoad(inputTexture, center + circleOffsets[i], 0).r;
      score += abs(intensity - centerIntensity);
    }

    textureStore(outputTexture, center, vec4<f32>(score));
  } else {
    textureStore(outputTexture, center, vec4<f32>(0.0));
  }
}
