// Contour Detection Shader
// Detects edges in binary image for marker candidate extraction
// Uses Suzuki border following algorithm (simplified GPU version)

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<r32uint, write>;

// Edge detection: find transitions from 0 to 1
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(inputTexture);

  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let center = vec2<i32>(global_id.xy);
  let centerValue = textureLoad(inputTexture, center, 0).r;

  // Check if this pixel is an edge
  var isEdge = false;

  if (centerValue > 0.5) {
    // Check 4-connected neighbors
    let offsets = array<vec2<i32>, 4>(
      vec2<i32>(-1, 0),  // left
      vec2<i32>(1, 0),   // right
      vec2<i32>(0, -1),  // top
      vec2<i32>(0, 1)    // bottom
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
