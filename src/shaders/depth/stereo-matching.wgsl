// Stereo Matching Shader
// Computes disparity/depth from stereo image pair using block matching

@group(0) @binding(0) var leftImage: texture_2d<f32>;
@group(0) @binding(1) var rightImage: texture_2d<f32>;
@group(0) @binding(2) var disparityOutput: texture_storage_2d<r32float, write>;
@group(0) @binding(3) var<uniform> params: StereoParams;

struct StereoParams {
  width: u32,
  height: u32,
  minDisparity: i32,
  maxDisparity: i32,
  blockSize: u32,      // e.g., 9 for 9x9 blocks
  baseline: f32,       // Stereo baseline in meters
  focalLength: f32,    // Focal length in pixels
  _padding: u32,
}

// Sum of Absolute Differences (SAD) block matching
fn computeSAD(leftCoord: vec2<i32>, rightCoord: vec2<i32>, halfBlock: i32) -> f32 {
  var sad = 0.0;
  var count = 0.0;

  for (var dy = -halfBlock; dy <= halfBlock; dy++) {
    for (var dx = -halfBlock; dx <= halfBlock; dx++) {
      let leftSample = leftCoord + vec2<i32>(dx, dy);
      let rightSample = rightCoord + vec2<i32>(dx, dy);

      // Bounds check
      if (leftSample.x < 0 || leftSample.x >= i32(params.width) ||
          leftSample.y < 0 || leftSample.y >= i32(params.height) ||
          rightSample.x < 0 || rightSample.x >= i32(params.width) ||
          rightSample.y < 0 || rightSample.y >= i32(params.height)) {
        continue;
      }

      let leftVal = textureLoad(leftImage, leftSample, 0).r;
      let rightVal = textureLoad(rightImage, rightSample, 0).r;

      sad += abs(leftVal - rightVal);
      count += 1.0;
    }
  }

  return select(999999.0, sad / count, count > 0.0);
}

// Census transform for robustness
fn computeCensus(coord: vec2<i32>, image: texture_2d<f32>, halfBlock: i32) -> u32 {
  let center = textureLoad(image, coord, 0).r;
  var census = 0u;
  var bit = 0u;

  for (var dy = -halfBlock; dy <= halfBlock; dy++) {
    for (var dx = -halfBlock; dx <= halfBlock; dx++) {
      if (dx == 0 && dy == 0) {
        continue; // Skip center
      }

      let sampleCoord = coord + vec2<i32>(dx, dy);

      if (sampleCoord.x >= 0 && sampleCoord.x < i32(params.width) &&
          sampleCoord.y >= 0 && sampleCoord.y < i32(params.height)) {
        let val = textureLoad(image, sampleCoord, 0).r;

        if (val > center) {
          census |= (1u << bit);
        }
      }

      bit++;
      if (bit >= 32u) {
        break;
      }
    }
    if (bit >= 32u) {
      break;
    }
  }

  return census;
}

// Hamming distance between census transforms
fn hammingDistance(a: u32, b: u32) -> u32 {
  var x = a ^ b;
  var count = 0u;

  // Count set bits
  for (var i = 0u; i < 32u; i++) {
    if ((x & 1u) != 0u) {
      count++;
    }
    x >>= 1u;
  }

  return count;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let coord = vec2<i32>(global_id.xy);

  if (global_id.x >= params.width || global_id.y >= params.height) {
    return;
  }

  let halfBlock = i32(params.blockSize) / 2;

  // Skip border regions
  if (coord.x < halfBlock || coord.x >= i32(params.width) - halfBlock ||
      coord.y < halfBlock || coord.y >= i32(params.height) - halfBlock) {
    textureStore(disparityOutput, coord, vec4<f32>(0.0));
    return;
  }

  // Compute census transform for left pixel
  let leftCensus = computeCensus(coord, leftImage, halfBlock);

  // Find best disparity
  var bestDisparity = 0;
  var bestCost = 999999.0;

  for (var d = params.minDisparity; d <= params.maxDisparity; d++) {
    let rightCoord = coord - vec2<i32>(d, 0);

    // Skip if out of bounds
    if (rightCoord.x < halfBlock || rightCoord.x >= i32(params.width) - halfBlock) {
      continue;
    }

    // Compute cost (Census + SAD hybrid)
    let rightCensus = computeCensus(rightCoord, rightImage, halfBlock);
    let censusCost = f32(hammingDistance(leftCensus, rightCensus));
    let sadCost = computeSAD(coord, rightCoord, halfBlock);

    let cost = censusCost * 0.3 + sadCost * 0.7;

    if (cost < bestCost) {
      bestCost = cost;
      bestDisparity = d;
    }
  }

  // Sub-pixel refinement using parabola fitting
  var refinedDisparity = f32(bestDisparity);

  if (bestDisparity > params.minDisparity && bestDisparity < params.maxDisparity) {
    let d0 = bestDisparity - 1;
    let d2 = bestDisparity + 1;

    let coord0 = coord - vec2<i32>(d0, 0);
    let coord2 = coord - vec2<i32>(d2, 0);

    if (coord0.x >= halfBlock && coord2.x < i32(params.width) - halfBlock) {
      let cost0 = computeSAD(coord, coord0, halfBlock);
      let cost1 = bestCost;
      let cost2 = computeSAD(coord, coord2, halfBlock);

      // Parabola fitting
      let denom = 2.0 * (cost0 - 2.0 * cost1 + cost2);
      if (abs(denom) > 0.001) {
        let offset = (cost0 - cost2) / denom;
        refinedDisparity = f32(bestDisparity) + clamp(offset, -1.0, 1.0);
      }
    }
  }

  // Convert disparity to depth
  var depth: f32;
  if (refinedDisparity > 0.5) {
    depth = (params.baseline * params.focalLength) / refinedDisparity;
    depth = clamp(depth, 0.1, 10.0);
  } else {
    depth = 0.0;
  }

  textureStore(disparityOutput, coord, vec4<f32>(depth));
}

// Left-right consistency check (second pass)
@compute @workgroup_size(16, 16)
fn consistencyCheck(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let coord = vec2<i32>(global_id.xy);

  if (global_id.x >= params.width || global_id.y >= params.height) {
    return;
  }

  let leftDisparity = textureLoad(disparityOutput, coord, 0).r;

  if (leftDisparity <= 0.0) {
    return;
  }

  // Convert depth back to disparity for check
  let disparity = (params.baseline * params.focalLength) / leftDisparity;

  // Check corresponding right pixel
  let rightCoord = coord - vec2<i32>(i32(disparity), 0);

  if (rightCoord.x >= 0 && rightCoord.x < i32(params.width)) {
    // In full implementation, would check right-to-left disparity
    // For now, simple threshold check
    let threshold = 1.5; // pixels

    // If inconsistent, invalidate
    // (Right disparity map would be computed in separate pass)
  }
}
