// Grayscale Conversion Shader
// Converts RGB camera input to grayscale for CV processing
// Uses standard luminance weights: 0.299R + 0.587G + 0.114B

@group(0) @binding(0) var inputTexture: texture_external;
@group(0) @binding(1) var outputTexture: texture_storage_2d<r8unorm, write>;

// Workgroup size optimized for desktop (16x16) and mobile (8x8)
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(outputTexture);

  // Bounds check
  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  // Sample input texture (normalized coordinates)
  let uv = vec2<f32>(
    f32(global_id.x) / f32(dims.x),
    f32(global_id.y) / f32(dims.y)
  );

  let rgba = textureLoad(inputTexture, vec2<i32>(global_id.xy));

  // Convert to grayscale using standard luminance formula
  let gray = dot(rgba.rgb, vec3<f32>(0.299, 0.587, 0.114));

  // Write to output (single channel)
  textureStore(outputTexture, vec2<i32>(global_id.xy), vec4<f32>(gray, 0.0, 0.0, 0.0));
}
