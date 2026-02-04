#version 300 es
precision highp float;

// WebGL2 Fragment Shader - Grayscale Conversion
// Emulates compute shader functionality via render-to-texture
// Uses standard luminance weights: 0.299R + 0.587G + 0.114B

// Input
uniform sampler2D inputTexture;
in vec2 vUV;

// Output
out vec4 fragColor;

void main() {
  // Sample input texture
  vec4 rgba = texture(inputTexture, vUV);

  // Convert to grayscale using standard luminance formula
  float gray = dot(rgba.rgb, vec3(0.299, 0.587, 0.114));

  // Output grayscale value (single channel for WebGL2)
  // Note: WebGL2 uses R8 format for single-channel output
  fragColor = vec4(gray, 0.0, 0.0, 1.0);
}
