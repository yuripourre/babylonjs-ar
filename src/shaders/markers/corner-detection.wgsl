// Corner Detection Shader
// Detects corners in contours using Harris corner detector
// Optimized for marker corner detection

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> params: CornerParams;

struct CornerParams {
  threshold: f32,
  k: f32,  // Harris k parameter (typically 0.04-0.06)
  _padding: vec2<f32>,
}

// Sobel kernels for gradient computation
const sobelX = array<array<f32, 3>, 3>(
  array<f32, 3>(-1.0, 0.0, 1.0),
  array<f32, 3>(-2.0, 0.0, 2.0),
  array<f32, 3>(-1.0, 0.0, 1.0)
);

const sobelY = array<array<f32, 3>, 3>(
  array<f32, 3>(-1.0, -2.0, -1.0),
  array<f32, 3>(0.0, 0.0, 0.0),
  array<f32, 3>(1.0, 2.0, 1.0)
);

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(inputTexture);

  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let center = vec2<i32>(global_id.xy);

  // Skip border pixels
  if (center.x < 1 || center.x >= i32(dims.x) - 1 ||
      center.y < 1 || center.y >= i32(dims.y) - 1) {
    textureStore(outputTexture, center, vec4<f32>(0.0));
    return;
  }

  // Compute gradients using Sobel
  var Ix = 0.0;
  var Iy = 0.0;

  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let coord = center + vec2<i32>(dx, dy);
      let pixel = textureLoad(inputTexture, coord, 0).r;
      Ix += pixel * sobelX[dy + 1][dx + 1];
      Iy += pixel * sobelY[dy + 1][dx + 1];
    }
  }

  // Harris matrix components
  let Ix2 = Ix * Ix;
  let Iy2 = Iy * Iy;
  let Ixy = Ix * Iy;

  // Harris response: R = det(M) - k * trace(M)^2
  let det = Ix2 * Iy2 - Ixy * Ixy;
  let trace = Ix2 + Iy2;
  let response = det - params.k * trace * trace;

  // Store response and gradients for later processing
  textureStore(outputTexture, center, vec4<f32>(response, Ix, Iy, 0.0));
}
