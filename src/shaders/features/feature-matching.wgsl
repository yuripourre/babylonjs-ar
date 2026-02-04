// Feature Matching using Hamming Distance
// Matches ORB descriptors between frames
// Uses ratio test for robustness

@group(0) @binding(0) var<storage, read> descriptors1: array<u32>; // Current frame
@group(0) @binding(1) var<storage, read> descriptors2: array<u32>; // Reference frame
@group(0) @binding(2) var<storage, read_write> matches: array<vec2<i32>>; // (idx1, idx2) pairs
@group(0) @binding(3) var<uniform> params: MatchingParams;

struct MatchingParams {
  numDescriptors1: u32,
  numDescriptors2: u32,
  maxDistance: u32,     // Max Hamming distance (typically 50-80)
  ratioThreshold: f32,  // Lowe's ratio test (typically 0.7-0.8)
}

// Compute Hamming distance between two descriptors
fn hammingDistance(idx1: u32, idx2: u32) -> u32 {
  var distance = 0u;

  // Each descriptor is 8 u32s (256 bits)
  for (var i = 0u; i < 8u; i++) {
    let word1 = descriptors1[idx1 * 8u + i];
    let word2 = descriptors2[idx2 * 8u + i];

    // XOR and count bits
    let xor = word1 ^ word2;
    distance += countOneBits(xor);
  }

  return distance;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let desc1Idx = global_id.x;

  if (desc1Idx >= params.numDescriptors1) {
    return;
  }

  // Find best two matches for ratio test
  var bestDist = 0xFFFFFFFFu;
  var secondBestDist = 0xFFFFFFFFu;
  var bestIdx = -1;

  for (var desc2Idx = 0u; desc2Idx < params.numDescriptors2; desc2Idx++) {
    let dist = hammingDistance(desc1Idx, desc2Idx);

    if (dist < bestDist) {
      secondBestDist = bestDist;
      bestDist = dist;
      bestIdx = i32(desc2Idx);
    } else if (dist < secondBestDist) {
      secondBestDist = dist;
    }
  }

  // Apply ratio test
  let ratio = f32(bestDist) / f32(secondBestDist);

  if (bestIdx >= 0 && bestDist <= params.maxDistance && ratio < params.ratioThreshold) {
    matches[desc1Idx] = vec2<i32>(i32(desc1Idx), bestIdx);
  } else {
    matches[desc1Idx] = vec2<i32>(-1, -1); // No match
  }
}
