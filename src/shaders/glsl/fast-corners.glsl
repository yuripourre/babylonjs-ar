#version 300 es
precision highp float;

// FAST (Features from Accelerated Segment Test) Corner Detection
// Detects corners by comparing pixel intensity with circle of 16 pixels
// Threshold version: at least 12 contiguous pixels must be brighter or darker

// Inputs
uniform sampler2D inputTexture;
uniform float threshold;
uniform uint nonMaxSuppression;
in vec2 vUV;

// Output
out vec4 fragColor;

// Bresenham circle offsets (radius 3)
const ivec2 circleOffsets[16] = ivec2[16](
  ivec2(0, 3),    // 0
  ivec2(1, 3),    // 1
  ivec2(2, 2),    // 2
  ivec2(3, 1),    // 3
  ivec2(3, 0),    // 4
  ivec2(3, -1),   // 5
  ivec2(2, -2),   // 6
  ivec2(1, -3),   // 7
  ivec2(0, -3),   // 8
  ivec2(-1, -3),  // 9
  ivec2(-2, -2),  // 10
  ivec2(-3, -1),  // 11
  ivec2(-3, 0),   // 12
  ivec2(-3, 1),   // 13
  ivec2(-2, 2),   // 14
  ivec2(-1, 3)    // 15
);

void main() {
  vec2 texSize = vec2(textureSize(inputTexture, 0));
  ivec2 center = ivec2(vUV * texSize);
  ivec2 dims = textureSize(inputTexture, 0);

  // Skip borders (radius 3)
  if (center.x < 3 || center.x >= dims.x - 3 ||
      center.y < 3 || center.y >= dims.y - 3) {
    fragColor = vec4(0.0);
    return;
  }

  // Get center intensity
  float centerIntensity = texelFetch(inputTexture, center, 0).r;

  // Fast rejection test: check 4 cardinal points
  bool cardinalBrighter =
    (texelFetch(inputTexture, center + circleOffsets[0], 0).r > centerIntensity + threshold) &&
    (texelFetch(inputTexture, center + circleOffsets[4], 0).r > centerIntensity + threshold) &&
    (texelFetch(inputTexture, center + circleOffsets[8], 0).r > centerIntensity + threshold) &&
    (texelFetch(inputTexture, center + circleOffsets[12], 0).r > centerIntensity + threshold);

  bool cardinalDarker =
    (texelFetch(inputTexture, center + circleOffsets[0], 0).r < centerIntensity - threshold) &&
    (texelFetch(inputTexture, center + circleOffsets[4], 0).r < centerIntensity - threshold) &&
    (texelFetch(inputTexture, center + circleOffsets[8], 0).r < centerIntensity - threshold) &&
    (texelFetch(inputTexture, center + circleOffsets[12], 0).r < centerIntensity - threshold);

  if (!cardinalBrighter && !cardinalDarker) {
    fragColor = vec4(0.0);
    return;
  }

  // Full circle test
  uint brighterCount = 0u;
  uint darkerCount = 0u;
  uint maxBrighterSeq = 0u;
  uint maxDarkerSeq = 0u;
  uint currentBrighterSeq = 0u;
  uint currentDarkerSeq = 0u;

  // Check twice to handle wrap-around
  for (int i = 0; i < 32; i++) {
    int idx = i % 16;
    float intensity = texelFetch(inputTexture, center + circleOffsets[idx], 0).r;

    if (intensity > centerIntensity + threshold) {
      brighterCount++;
      currentBrighterSeq++;
      currentDarkerSeq = 0u;
      maxBrighterSeq = max(maxBrighterSeq, currentBrighterSeq);
    } else if (intensity < centerIntensity - threshold) {
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
  bool isCorner = maxBrighterSeq >= 12u || maxDarkerSeq >= 12u;

  if (isCorner) {
    // Compute corner score (sum of absolute differences)
    float score = 0.0;
    for (int i = 0; i < 16; i++) {
      float intensity = texelFetch(inputTexture, center + circleOffsets[i], 0).r;
      score += abs(intensity - centerIntensity);
    }

    fragColor = vec4(score);
  } else {
    fragColor = vec4(0.0);
  }
}
