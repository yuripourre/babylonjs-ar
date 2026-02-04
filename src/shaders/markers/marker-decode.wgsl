// ArUco Marker Decoding on GPU
// Decodes marker bits and matches against dictionary
// Eliminates CPU readback bottleneck

@group(0) @binding(0) var warpedTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> decodedMarkers: array<DecodedMarker>;
@group(0) @binding(2) var<uniform> params: DecodeParams;
@group(0) @binding(3) var<storage, read> dictionary: array<u32>; // ArUco dictionary patterns

struct DecodedMarker {
  id: i32,              // Marker ID (-1 if invalid)
  rotation: u32,        // Rotation (0, 1, 2, 3 for 0°, 90°, 180°, 270°)
  valid: u32,           // 1 if valid, 0 if invalid
  confidence: f32,      // Confidence score [0, 1]
  corners: vec4<f32>,   // Quad corners (packed)
  corners2: vec4<f32>,  // Additional corners
}

struct DecodeParams {
  markerIndex: u32,     // Which marker we're decoding
  markerSize: u32,      // Size of marker (e.g., 4 for 4x4)
  dictionarySize: u32,  // Number of markers in dictionary
  borderBits: u32,      // Number of border bits (usually 1)
}

// Extract bit grid from warped texture
fn extractBits(markerSize: u32) -> array<u32, 16> {
  var bits: array<u32, 16>;
  let cellSize = 1.0 / f32(markerSize + 2); // +2 for border

  for (var y = 0u; y < markerSize; y++) {
    for (var x = 0u; x < markerSize; x++) {
      // Sample center of each cell (skip border)
      let u = (f32(x + 1) + 0.5) * cellSize;
      let v = (f32(y + 1) + 0.5) * cellSize;

      let coord = vec2<i32>(
        i32(u * f32(textureDimensions(warpedTexture).x)),
        i32(v * f32(textureDimensions(warpedTexture).y))
      );

      let value = textureLoad(warpedTexture, coord, 0).r;

      // Threshold: > 0.5 = white (1), < 0.5 = black (0)
      let bit = select(0u, 1u, value > 0.5);
      bits[y * markerSize + x] = bit;
    }
  }

  return bits;
}

// Verify border is all black
fn verifyBorder() -> bool {
  let size = textureDimensions(warpedTexture);
  let width = size.x;
  let height = size.y;
  let borderWidth = width / (params.markerSize + 2);

  // Check top and bottom borders
  for (var x = 0; x < i32(width); x++) {
    let top = textureLoad(warpedTexture, vec2<i32>(x, 0), 0).r;
    let bottom = textureLoad(warpedTexture, vec2<i32>(x, i32(height) - 1), 0).r;

    if (top > 0.5 || bottom > 0.5) {
      return false;
    }
  }

  // Check left and right borders
  for (var y = 0; y < i32(height); y++) {
    let left = textureLoad(warpedTexture, vec2<i32>(0, y), 0).r;
    let right = textureLoad(warpedTexture, vec2<i32>(i32(width) - 1, y), 0).r;

    if (left > 0.5 || right > 0.5) {
      return false;
    }
  }

  return true;
}

// Convert bit array to integer code
fn bitsToCode(bits: array<u32, 16>, markerSize: u32) -> u32 {
  var code = 0u;
  let numBits = markerSize * markerSize;

  for (var i = 0u; i < numBits; i++) {
    code = (code << 1u) | bits[i];
  }

  return code;
}

// Rotate bit array 90° clockwise
fn rotateBits(bits: array<u32, 16>, markerSize: u32) -> array<u32, 16> {
  var rotated: array<u32, 16>;

  for (var y = 0u; y < markerSize; y++) {
    for (var x = 0u; x < markerSize; x++) {
      // (x, y) -> (markerSize - 1 - y, x)
      let srcIdx = y * markerSize + x;
      let dstIdx = x * markerSize + (markerSize - 1u - y);
      rotated[dstIdx] = bits[srcIdx];
    }
  }

  return rotated;
}

// Match against dictionary
fn matchDictionary(code: u32) -> i32 {
  for (var i = 0u; i < params.dictionarySize; i++) {
    if (dictionary[i] == code) {
      return i32(i);
    }
  }
  return -1;
}

// Hamming distance between two codes
fn hammingDistance(a: u32, b: u32) -> u32 {
  var x = a ^ b;
  var count = 0u;

  while (x != 0u) {
    count += x & 1u;
    x >>= 1u;
  }

  return count;
}

// Find closest match in dictionary (with error correction)
fn matchDictionaryWithCorrection(code: u32, maxErrors: u32) -> i32 {
  var bestMatch = -1;
  var bestDistance = 999u;

  for (var i = 0u; i < params.dictionarySize; i++) {
    let distance = hammingDistance(code, dictionary[i]);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = i32(i);
    }
  }

  if (bestDistance <= maxErrors) {
    return bestMatch;
  }

  return -1;
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // One thread per marker
  let markerIdx = params.markerIndex;

  // Initialize output
  decodedMarkers[markerIdx].id = -1;
  decodedMarkers[markerIdx].valid = 0u;
  decodedMarkers[markerIdx].confidence = 0.0;

  // Verify border
  if (!verifyBorder()) {
    return; // Invalid marker
  }

  // Extract bits
  let bits = extractBits(params.markerSize);

  // Try all 4 rotations
  var currentBits = bits;
  var foundRotation = 0u;
  var foundId = -1;

  for (var rot = 0u; rot < 4u; rot++) {
    let code = bitsToCode(currentBits, params.markerSize);

    // Try exact match first
    let matchId = matchDictionary(code);

    if (matchId >= 0) {
      foundId = matchId;
      foundRotation = rot;
      break;
    }

    // Try with error correction (1 bit error)
    let correctedId = matchDictionaryWithCorrection(code, 1u);

    if (correctedId >= 0) {
      foundId = correctedId;
      foundRotation = rot;
      break;
    }

    // Rotate for next iteration
    currentBits = rotateBits(currentBits, params.markerSize);
  }

  // Store result
  if (foundId >= 0) {
    decodedMarkers[markerIdx].id = foundId;
    decodedMarkers[markerIdx].rotation = foundRotation;
    decodedMarkers[markerIdx].valid = 1u;
    decodedMarkers[markerIdx].confidence = 1.0; // Could compute based on contrast
  }
}
