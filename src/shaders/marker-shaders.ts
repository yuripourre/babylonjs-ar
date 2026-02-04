/**
 * Marker Detection Shaders
 * Exports WGSL shader code for marker detection pipeline
 */

export const gaussianBlurShader = `
// Gaussian Blur Shader (Separable)
// Two-pass blur for efficiency: horizontal then vertical
// Uses 5-tap kernel for good quality/performance balance

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: BlurParams;

struct BlurParams {
  direction: vec2<f32>,
  radius: f32,
  _padding: f32,
}

const weights = array<f32, 5>(0.06, 0.24, 0.40, 0.24, 0.06);

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(inputTexture);

  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let center = vec2<i32>(global_id.xy);
  let dir = vec2<i32>(params.direction);

  var sum = vec4<f32>(0.0);

  for (var i = -2; i <= 2; i++) {
    let offset = center + dir * i;
    let coord = clamp(offset, vec2<i32>(0), vec2<i32>(dims) - vec2<i32>(1));
    let sample = textureLoad(inputTexture, coord, 0);
    sum += sample * weights[i + 2];
  }

  textureStore(outputTexture, center, sum);
}
`;

export const adaptiveThresholdShader = `
// Adaptive Threshold Shader
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<r8unorm, write>;
@group(0) @binding(2) var<uniform> params: ThresholdParams;

struct ThresholdParams {
  blockSize: u32,
  constant: f32,
  _padding: vec2<f32>,
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(inputTexture);

  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let center = vec2<i32>(global_id.xy);
  let halfBlock = i32(params.blockSize) / 2;

  var sum = 0.0;
  var count = 0.0;

  for (var dy = -halfBlock; dy <= halfBlock; dy++) {
    for (var dx = -halfBlock; dx <= halfBlock; dx++) {
      let coord = center + vec2<i32>(dx, dy);
      if (coord.x >= 0 && coord.x < i32(dims.x) && coord.y >= 0 && coord.y < i32(dims.y)) {
        let sample = textureLoad(inputTexture, coord, 0);
        sum += sample.r;
        count += 1.0;
      }
    }
  }

  let mean = sum / count;
  let centerValue = textureLoad(inputTexture, center, 0).r;

  let threshold = mean - params.constant / 255.0;
  let output = select(0.0, 1.0, centerValue > threshold);

  textureStore(outputTexture, center, vec4<f32>(output, 0.0, 0.0, 0.0));
}
`;

export const contourDetectionShader = `
// Contour Detection Shader
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<r32uint, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(inputTexture);

  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let center = vec2<i32>(global_id.xy);
  let centerValue = textureLoad(inputTexture, center, 0).r;

  var isEdge = false;

  if (centerValue > 0.5) {
    let offsets = array<vec2<i32>, 4>(
      vec2<i32>(-1, 0),
      vec2<i32>(1, 0),
      vec2<i32>(0, -1),
      vec2<i32>(0, 1)
    );

    for (var i = 0; i < 4; i++) {
      let neighbor = center + offsets[i];
      if (neighbor.x >= 0 && neighbor.x < i32(dims.x) &&
          neighbor.y >= 0 && neighbor.y < i32(dims.y)) {
        let neighborValue = textureLoad(inputTexture, neighbor, 0).r;
        if (neighborValue < 0.5) {
          isEdge = true;
          break;
        }
      }
    }
  }

  let output = select(0u, 1u, isEdge);
  textureStore(outputTexture, center, vec4<u32>(output, 0u, 0u, 0u));
}
`;

export const cornerDetectionShader = `
// Corner Detection Shader
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> params: CornerParams;

struct CornerParams {
  threshold: f32,
  k: f32,
  _padding: vec2<f32>,
}

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

  if (center.x < 1 || center.x >= i32(dims.x) - 1 ||
      center.y < 1 || center.y >= i32(dims.y) - 1) {
    textureStore(outputTexture, center, vec4<f32>(0.0));
    return;
  }

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

  let Ix2 = Ix * Ix;
  let Iy2 = Iy * Iy;
  let Ixy = Ix * Iy;

  let det = Ix2 * Iy2 - Ixy * Ixy;
  let trace = Ix2 + Iy2;
  let response = det - params.k * trace * trace;

  textureStore(outputTexture, center, vec4<f32>(response, Ix, Iy, 0.0));
}
`;

export const perspectiveWarpShader = `
// Perspective Warp Shader
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var outputTexture: texture_storage_2d<r8unorm, write>;
@group(0) @binding(3) var<uniform> homography: Homography;

struct Homography {
  h00: f32, h01: f32, h02: f32, _p0: f32,
  h10: f32, h11: f32, h12: f32, _p1: f32,
  h20: f32, h21: f32, h22: f32, _p2: f32,
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let outputDims = textureDimensions(outputTexture);

  if (global_id.x >= outputDims.x || global_id.y >= outputDims.y) {
    return;
  }

  let outCoord = vec2<f32>(global_id.xy) / vec2<f32>(outputDims);

  let x = outCoord.x;
  let y = outCoord.y;

  let xPrime = homography.h00 * x + homography.h01 * y + homography.h02;
  let yPrime = homography.h10 * x + homography.h11 * y + homography.h12;
  let w = homography.h20 * x + homography.h21 * y + homography.h22;

  let inCoord = vec2<f32>(xPrime / w, yPrime / w);

  let sample = textureSampleLevel(inputTexture, inputSampler, inCoord, 0.0);

  textureStore(outputTexture, vec2<i32>(global_id.xy), vec4<f32>(sample.r, 0.0, 0.0, 0.0));
}
`;
