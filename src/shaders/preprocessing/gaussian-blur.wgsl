// Gaussian Blur Shader (Separable)
// Two-pass blur for efficiency: horizontal then vertical
// Uses 5-tap kernel for good quality/performance balance

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: BlurParams;

struct BlurParams {
  direction: vec2<f32>,  // (1,0) for horizontal, (0,1) for vertical
  radius: f32,
  _padding: f32,
}

// 5-tap Gaussian kernel weights
// sigma = 1.0: [0.06, 0.24, 0.40, 0.24, 0.06]
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

  // 5-tap blur
  for (var i = -2; i <= 2; i++) {
    let offset = center + dir * i;
    let coord = clamp(offset, vec2<i32>(0), vec2<i32>(dims) - vec2<i32>(1));
    let sample = textureLoad(inputTexture, coord, 0);
    sum += sample * weights[i + 2];
  }

  textureStore(outputTexture, center, sum);
}
