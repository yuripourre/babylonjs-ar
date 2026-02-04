#version 300 es
precision highp float;

// Contour Detection Fragment Shader
// Detects edges in binary image for marker candidate extraction

// Inputs
uniform sampler2D inputTexture;
in vec2 vUV;

// Output
out vec4 fragColor;

void main() {
  vec2 texSize = vec2(textureSize(inputTexture, 0));
  ivec2 center = ivec2(vUV * texSize);
  ivec2 dims = textureSize(inputTexture, 0);

  float centerValue = texelFetch(inputTexture, center, 0).r;

  // Check if this pixel is an edge
  bool isEdge = false;

  if (centerValue > 0.5) {
    // Check 4-connected neighbors
    ivec2 offsets[4] = ivec2[4](
      ivec2(-1, 0),  // left
      ivec2(1, 0),   // right
      ivec2(0, -1),  // top
      ivec2(0, 1)    // bottom
    );

    for (int i = 0; i < 4; i++) {
      ivec2 neighbor = center + offsets[i];
      if (neighbor.x >= 0 && neighbor.x < dims.x &&
          neighbor.y >= 0 && neighbor.y < dims.y) {
        float neighborValue = texelFetch(inputTexture, neighbor, 0).r;
        if (neighborValue < 0.5) {
          isEdge = true;
          break;
        }
      }
    }
  }

  float output = isEdge ? 1.0 : 0.0;
  fragColor = vec4(output, 0.0, 0.0, 0.0);
}
