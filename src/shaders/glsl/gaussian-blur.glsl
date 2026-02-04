#version 300 es
precision highp float;

// Gaussian Blur Fragment Shader (Separable)
// Two-pass blur for efficiency: horizontal then vertical
// Uses 5-tap kernel for good quality/performance balance

// Inputs
uniform sampler2D inputTexture;
uniform vec2 direction;  // (1,0) for horizontal, (0,1) for vertical
uniform float radius;
in vec2 vUV;

// Output
out vec4 fragColor;

// 5-tap Gaussian kernel weights
// sigma = 1.0: [0.06, 0.24, 0.40, 0.24, 0.06]
const float weights[5] = float[5](0.06, 0.24, 0.40, 0.24, 0.06);

void main() {
  vec2 texSize = vec2(textureSize(inputTexture, 0));
  ivec2 center = ivec2(vUV * texSize);
  ivec2 dims = textureSize(inputTexture, 0);
  ivec2 dir = ivec2(direction);

  vec4 sum = vec4(0.0);

  // 5-tap blur
  for (int i = -2; i <= 2; i++) {
    ivec2 offset = center + dir * i;
    ivec2 coord = clamp(offset, ivec2(0), dims - ivec2(1));
    vec4 sample = texelFetch(inputTexture, coord, 0);
    sum += sample * weights[i + 2];
  }

  fragColor = sum;
}
