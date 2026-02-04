// Adaptive Threshold Shader
// Local thresholding for robust marker detection under varying lighting
// Uses sliding window mean with configurable block size

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<r8unorm, write>;
@group(0) @binding(2) var<uniform> params: ThresholdParams;

struct ThresholdParams {
  blockSize: u32,      // Window size (e.g., 11, 15, 21)
  constant: f32,       // Subtracted from mean (typically 5-10)
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

  // Compute local mean
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

  // Threshold: pixel > (mean - constant) ? 1 : 0
  let threshold = mean - params.constant / 255.0;
  let output = select(0.0, 1.0, centerValue > threshold);

  textureStore(outputTexture, center, vec4<f32>(output, 0.0, 0.0, 0.0));
}
