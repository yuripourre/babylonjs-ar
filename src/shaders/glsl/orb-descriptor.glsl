#version 300 es
precision highp float;

// ORB (Oriented FAST and Rotated BRIEF) Descriptor
// Computes 256-bit binary descriptor for each keypoint
// Rotation invariant using intensity centroid
// NOTE: This is a simplified version for WebGL2
// Full implementation with buffer storage may need CPU fallback

// Inputs
uniform sampler2D inputTexture;
uniform sampler2D keypointsTexture; // Encoded as RGBA: (x, y, angle, response)
uniform uint keypointIndex;
uniform uint patchSize; // 31 typical
in vec2 vUV;

// Output (encodes 256 bits across multiple pixels)
out vec4 fragColor;

const uint numPairs = 256u;

// Generate test pattern (normally loaded from precomputed)
vec4 getTestPair(uint idx) {
  // Returns (x1, y1, x2, y2) for pair comparison
  float angle = float(idx) * 6.2831853 / 256.0;
  float radius = 15.0;

  float x1 = cos(angle) * radius;
  float y1 = sin(angle) * radius;
  float x2 = cos(angle + 3.14159) * radius;
  float y2 = sin(angle + 3.14159) * radius;

  return vec4(x1, y1, x2, y2);
}

// Rotate point around origin
ivec2 rotatePoint(ivec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);

  float x = float(p.x) * c - float(p.y) * s;
  float y = float(p.x) * s + float(p.y) * c;

  return ivec2(int(round(x)), int(round(y)));
}

void main() {
  // Get keypoint from texture (encoded position based on keypointIndex)
  ivec2 kpTexCoord = ivec2(keypointIndex % 256u, keypointIndex / 256u);
  vec4 kp = texelFetch(keypointsTexture, kpTexCoord, 0);

  ivec2 center = ivec2(int(kp.x), int(kp.y));
  float angle = kp.z;

  ivec2 dims = textureSize(inputTexture, 0);

  // Check bounds
  int halfPatch = int(patchSize) / 2;
  if (center.x < halfPatch || center.x >= dims.x - halfPatch ||
      center.y < halfPatch || center.y >= dims.y - halfPatch) {
    // Mark as invalid
    fragColor = vec4(0.0);
    return;
  }

  // Compute descriptor bits for this fragment
  // Each fragment encodes 32 bits (stored in RGBA channels as 8 bits each)
  vec2 texSize = vec2(textureSize(inputTexture, 0));
  ivec2 fragCoord = ivec2(vUV * texSize);

  // Which 32-bit word are we computing? (0-7)
  uint wordIdx = uint(fragCoord.x % 8);
  uint baseIdx = wordIdx * 32u;

  uint descriptor = 0u;

  for (uint i = 0u; i < 32u; i++) {
    uint pairIdx = baseIdx + i;
    if (pairIdx >= numPairs) break;

    vec4 pair = getTestPair(pairIdx);

    // Rotate sampling points
    ivec2 p1 = rotatePoint(ivec2(int(pair.x), int(pair.y)), angle);
    ivec2 p2 = rotatePoint(ivec2(int(pair.z), int(pair.w)), angle);

    // Sample intensities
    ivec2 coord1 = center + p1;
    ivec2 coord2 = center + p2;

    float intensity1 = texelFetch(inputTexture, coord1, 0).r;
    float intensity2 = texelFetch(inputTexture, coord2, 0).r;

    // Binary test
    uint bit = intensity1 < intensity2 ? 1u : 0u;
    descriptor |= bit << i;
  }

  // Encode 32-bit descriptor into RGBA (8 bits per channel)
  float r = float((descriptor >> 0u) & 0xFFu) / 255.0;
  float g = float((descriptor >> 8u) & 0xFFu) / 255.0;
  float b = float((descriptor >> 16u) & 0xFFu) / 255.0;
  float a = float((descriptor >> 24u) & 0xFFu) / 255.0;

  fragColor = vec4(r, g, b, a);
}
