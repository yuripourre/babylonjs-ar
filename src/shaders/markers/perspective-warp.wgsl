// Perspective Warp Shader
// Extracts marker content using homography transformation
// Maps quadrilateral to square for bit decoding

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

  // Normalized coordinates in output space [0, 1]
  let outCoord = vec2<f32>(global_id.xy) / vec2<f32>(outputDims);

  // Apply homography to get input coordinates
  let x = outCoord.x;
  let y = outCoord.y;

  let xPrime = homography.h00 * x + homography.h01 * y + homography.h02;
  let yPrime = homography.h10 * x + homography.h11 * y + homography.h12;
  let w = homography.h20 * x + homography.h21 * y + homography.h22;

  let inCoord = vec2<f32>(xPrime / w, yPrime / w);

  // Sample input texture (bilinear interpolation via sampler)
  let inputDims = vec2<f32>(textureDimensions(inputTexture));
  let sample = textureSampleLevel(inputTexture, inputSampler, inCoord, 0.0);

  textureStore(outputTexture, vec2<i32>(global_id.xy), vec4<f32>(sample.r, 0.0, 0.0, 0.0));
}
