#version 300 es

// Fullscreen Quad Vertex Shader
// Used for all compute emulation passes in WebGL2

in vec2 position;
out vec2 vUV;

void main() {
  // Map [-1,1] position to [0,1] UV coordinates
  vUV = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
