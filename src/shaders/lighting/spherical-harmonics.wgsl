// Spherical Harmonics Light Estimation
// Extracts SH coefficients from environment map for PBR lighting

@group(0) @binding(0) var environmentMap: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> shCoefficients: array<vec4<f32>>; // 9 coefficients (RGB in xyz, count in w)
@group(0) @binding(2) var<uniform> params: SHParams;

struct SHParams {
  width: u32,
  height: u32,
  sampleCount: u32,
  _padding: u32,
}

// Spherical harmonics basis functions (L2, 9 bands)
// Y_l^m(theta, phi) where l=0,1,2 and m=-l...l

const PI = 3.14159265359;
const SQRT_PI = 1.77245385091;
const SQRT_3 = 1.73205080757;
const SQRT_5 = 2.23606797750;
const SQRT_15 = 3.87298334621;

// L=0, M=0
fn sh00() -> f32 {
  return 0.5 / SQRT_PI;
}

// L=1, M=-1
fn sh1n1(dir: vec3<f32>) -> f32 {
  return SQRT_3 / (2.0 * SQRT_PI) * dir.y;
}

// L=1, M=0
fn sh10(dir: vec3<f32>) -> f32 {
  return SQRT_3 / (2.0 * SQRT_PI) * dir.z;
}

// L=1, M=1
fn sh1p1(dir: vec3<f32>) -> f32 {
  return SQRT_3 / (2.0 * SQRT_PI) * dir.x;
}

// L=2, M=-2
fn sh2n2(dir: vec3<f32>) -> f32 {
  return 0.5 * SQRT_15 / SQRT_PI * dir.x * dir.y;
}

// L=2, M=-1
fn sh2n1(dir: vec3<f32>) -> f32 {
  return 0.5 * SQRT_15 / SQRT_PI * dir.y * dir.z;
}

// L=2, M=0
fn sh20(dir: vec3<f32>) -> f32 {
  return 0.25 * SQRT_5 / SQRT_PI * (3.0 * dir.z * dir.z - 1.0);
}

// L=2, M=1
fn sh2p1(dir: vec3<f32>) -> f32 {
  return 0.5 * SQRT_15 / SQRT_PI * dir.x * dir.z;
}

// L=2, M=2
fn sh2p2(dir: vec3<f32>) -> f32 {
  return 0.25 * SQRT_15 / SQRT_PI * (dir.x * dir.x - dir.y * dir.y);
}

// Evaluate all 9 SH basis functions
fn evaluateSH(dir: vec3<f32>) -> array<f32, 9> {
  var sh: array<f32, 9>;
  sh[0] = sh00();
  sh[1] = sh1n1(dir);
  sh[2] = sh10(dir);
  sh[3] = sh1p1(dir);
  sh[4] = sh2n2(dir);
  sh[5] = sh2n1(dir);
  sh[6] = sh20(dir);
  sh[7] = sh2p1(dir);
  sh[8] = sh2p2(dir);
  return sh;
}

// Convert texture coordinate to direction vector
fn texCoordToDirection(uv: vec2<f32>) -> vec3<f32> {
  // Equirectangular mapping
  let theta = uv.y * PI;           // [0, PI]
  let phi = uv.x * 2.0 * PI;       // [0, 2*PI]

  let sinTheta = sin(theta);
  let cosTheta = cos(theta);
  let sinPhi = sin(phi);
  let cosPhi = cos(phi);

  return vec3<f32>(
    sinTheta * cosPhi,
    sinTheta * sinPhi,
    cosTheta
  );
}

// Parallel reduction to accumulate SH coefficients
var<workgroup> sharedCoeffs: array<array<vec3<f32>, 9>, 256>; // 16x16 workgroup

@compute @workgroup_size(16, 16)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_index) local_idx: u32,
  @builtin(workgroup_id) workgroup_id: vec3<u32>
) {
  let coord = vec2<i32>(global_id.xy);

  // Initialize shared memory
  for (var i = 0u; i < 9u; i++) {
    sharedCoeffs[local_idx][i] = vec3<f32>(0.0);
  }

  workgroupBarrier();

  // Process pixel
  if (global_id.x < params.width && global_id.y < params.height) {
    // Get pixel color
    let color = textureLoad(environmentMap, coord, 0).rgb;

    // Convert to direction
    let uv = vec2<f32>(f32(global_id.x) / f32(params.width), f32(global_id.y) / f32(params.height));
    let dir = texCoordToDirection(uv);

    // Compute solid angle weight for equirectangular
    let theta = uv.y * PI;
    let solidAngle = sin(theta);

    // Evaluate SH basis
    let sh = evaluateSH(dir);

    // Accumulate to shared memory
    for (var i = 0u; i < 9u; i++) {
      sharedCoeffs[local_idx][i] = color * sh[i] * solidAngle;
    }
  }

  workgroupBarrier();

  // Parallel reduction within workgroup
  var step = 128u;
  while (step > 0u) {
    if (local_idx < step && local_idx + step < 256u) {
      for (var i = 0u; i < 9u; i++) {
        sharedCoeffs[local_idx][i] += sharedCoeffs[local_idx + step][i];
      }
    }
    workgroupBarrier();
    step >>= 1u;
  }

  // First thread writes workgroup result to global memory
  if (local_idx == 0u) {
    let workgroupIndex = workgroup_id.y * ((params.width + 15u) / 16u) + workgroup_id.x;

    for (var i = 0u; i < 9u; i++) {
      // Atomically add to global coefficients
      // Note: WebGPU doesn't have atomic floats, so we accumulate in array
      // and do final reduction on CPU
      let existingCount = shCoefficients[i * 100u + workgroupIndex].w;
      shCoefficients[i * 100u + workgroupIndex] = vec4<f32>(
        sharedCoeffs[0][i],
        existingCount + 1.0
      );
    }
  }
}

// Second pass: normalize coefficients
@compute @workgroup_size(9)
fn normalize(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let coeffIndex = global_id.x;

  if (coeffIndex >= 9u) {
    return;
  }

  // Sum all workgroup contributions for this coefficient
  var totalCoeff = vec3<f32>(0.0);
  var totalWeight = 0.0;

  for (var i = 0u; i < 100u; i++) {
    let idx = coeffIndex * 100u + i;
    let contrib = shCoefficients[idx];

    if (contrib.w > 0.0) {
      totalCoeff += contrib.xyz;
      totalWeight += 1.0;
    }
  }

  // Normalize by solid angle integral (4*PI for sphere)
  let normalized = totalCoeff * (4.0 * PI) / f32(params.width * params.height);

  // Store final coefficient
  shCoefficients[coeffIndex] = vec4<f32>(normalized, 1.0);
}

// Extract dominant light direction from SH coefficients
@compute @workgroup_size(1)
fn extractDominantLight(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // L=1 band gives directional information
  let sh1n1 = shCoefficients[1].xyz;
  let sh10 = shCoefficients[2].xyz;
  let sh1p1 = shCoefficients[3].xyz;

  // Reconstruct direction (weighted by RGB luminance)
  let direction = vec3<f32>(
    dot(sh1p1, vec3<f32>(0.299, 0.587, 0.114)),
    dot(sh1n1, vec3<f32>(0.299, 0.587, 0.114)),
    dot(sh10, vec3<f32>(0.299, 0.587, 0.114))
  );

  let len = length(direction);
  let normalizedDir = select(vec3<f32>(0.0, 1.0, 0.0), direction / len, len > 0.001);

  // Store in special slot (coefficient 9 as direction, 10 as intensity)
  shCoefficients[9] = vec4<f32>(normalizedDir, 1.0);

  // L=0 band gives ambient intensity
  let ambient = shCoefficients[0].xyz;
  let avgIntensity = dot(ambient, vec3<f32>(0.299, 0.587, 0.114));

  shCoefficients[10] = vec4<f32>(ambient, avgIntensity);
}
