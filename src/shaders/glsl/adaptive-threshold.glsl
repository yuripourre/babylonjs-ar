#version 300 es
precision highp float;

// Adaptive Threshold Fragment Shader
// Local thresholding for robust marker detection under varying lighting
// Uses sliding window mean with configurable block size

// Inputs
uniform sampler2D inputTexture;
uniform uint blockSize;      // Window size (e.g., 11, 15, 21)
uniform float constant;       // Subtracted from mean (typically 5-10)
in vec2 vUV;

// Output
out vec4 fragColor;

void main() {
  vec2 texSize = vec2(textureSize(inputTexture, 0));
  ivec2 center = ivec2(vUV * texSize);
  ivec2 dims = textureSize(inputTexture, 0);
  int halfBlock = int(blockSize) / 2;

  // Compute local mean
  float sum = 0.0;
  float count = 0.0;

  for (int dy = -halfBlock; dy <= halfBlock; dy++) {
    for (int dx = -halfBlock; dx <= halfBlock; dx++) {
      ivec2 coord = center + ivec2(dx, dy);
      if (coord.x >= 0 && coord.x < dims.x && coord.y >= 0 && coord.y < dims.y) {
        vec4 sample = texelFetch(inputTexture, coord, 0);
        sum += sample.r;
        count += 1.0;
      }
    }
  }

  float mean = sum / count;
  float centerValue = texelFetch(inputTexture, center, 0).r;

  // Threshold: pixel > (mean - constant) ? 1 : 0
  float threshold = mean - constant / 255.0;
  float output = centerValue > threshold ? 1.0 : 0.0;

  // Output to R8 format (single channel)
  fragColor = vec4(output, 0.0, 0.0, 0.0);
}
