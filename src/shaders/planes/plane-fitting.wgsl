// RANSAC Plane Fitting Shader
// Parallel RANSAC iterations on GPU for plane detection
// Each workgroup tests a different random plane hypothesis

@group(0) @binding(0) var<storage, read> points: array<vec4<f32>>; // xyz + valid flag
@group(0) @binding(1) var<storage, read> normals: array<vec4<f32>>; // xyz + confidence
@group(0) @binding(2) var<storage, read_write> planes: array<Plane>; // Output planes
@group(0) @binding(3) var<uniform> params: RANSACParams;

struct Plane {
  normal: vec3<f32>,
  distance: f32,
  inliers: u32,
  score: f32,
  centroid: vec3<f32>,
  _padding: f32,
}

struct RANSACParams {
  numPoints: u32,
  numIterations: u32,
  distanceThreshold: f32,
  normalThreshold: f32, // Cosine of max angle difference
  minInliers: u32,
  seed: u32,
  earlyTermThreshold: f32, // Inlier ratio for early termination (e.g., 0.8)
  _padding: f32,
}

// Simple random number generator (LCG)
fn randomU32(state: ptr<function, u32>) -> u32 {
  *state = (*state * 1664525u + 1013904223u);
  return *state;
}

fn randomFloat(state: ptr<function, u32>) -> f32 {
  return f32(randomU32(state)) / 4294967296.0;
}

fn randomIndex(state: ptr<function, u32>, max: u32) -> u32 {
  return u32(randomFloat(state) * f32(max)) % max;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let iterationIdx = global_id.x;

  if (iterationIdx >= params.numIterations) {
    return;
  }

  // Initialize random state (different for each iteration)
  var rngState = params.seed + iterationIdx * 12345u;

  // Sample 3 random points
  var indices: array<u32, 3>;
  var attempts = 0u;

  for (var i = 0u; i < 3u; i++) {
    loop {
      let idx = randomIndex(&rngState, params.numPoints);

      // Check if point is valid
      if (points[idx].w > 0.5) {
        // Check not duplicate
        var duplicate = false;
        for (var j = 0u; j < i; j++) {
          if (indices[j] == idx) {
            duplicate = true;
            break;
          }
        }

        if (!duplicate) {
          indices[i] = idx;
          break;
        }
      }

      attempts++;
      if (attempts > 100u) {
        // Failed to find valid points
        planes[iterationIdx].score = 0.0;
        return;
      }
    }
  }

  // Get the 3 points
  let p0 = points[indices[0]].xyz;
  let p1 = points[indices[1]].xyz;
  let p2 = points[indices[2]].xyz;

  // Compute plane from 3 points
  let v1 = p1 - p0;
  let v2 = p2 - p0;

  let normal = cross(v1, v2);
  let length = sqrt(dot(normal, normal));

  if (length < 0.001) {
    // Degenerate plane
    planes[iterationIdx].score = 0.0;
    return;
  }

  let planeNormal = normal / length;
  let planeDistance = -dot(planeNormal, p0);

  // Count inliers with early termination
  var inlierCount = 0u;
  var inlierSum = vec3<f32>(0.0);
  let earlyTermCount = u32(f32(params.numPoints) * params.earlyTermThreshold);

  for (var i = 0u; i < params.numPoints; i++) {
    if (points[i].w < 0.5) {
      continue;
    }

    let point = points[i].xyz;
    let distance = abs(dot(planeNormal, point) + planeDistance);

    if (distance < params.distanceThreshold) {
      // Check normal agreement if available
      if (normals[i].w > 0.5) {
        let pointNormal = normalize(normals[i].xyz);
        let normalDot = abs(dot(pointNormal, planeNormal));

        if (normalDot < params.normalThreshold) {
          continue; // Normal doesn't agree
        }
      }

      inlierCount++;
      inlierSum += point;

      // Early termination if we've found enough inliers
      if (params.earlyTermThreshold > 0.0 && inlierCount >= earlyTermCount) {
        break; // Excellent plane found, no need to check remaining points
      }
    }
  }

  // Store result
  if (inlierCount >= params.minInliers) {
    let centroid = inlierSum / f32(inlierCount);

    planes[iterationIdx].normal = planeNormal;
    planes[iterationIdx].distance = planeDistance;
    planes[iterationIdx].inliers = inlierCount;
    planes[iterationIdx].score = f32(inlierCount);
    planes[iterationIdx].centroid = centroid;
  } else {
    planes[iterationIdx].score = 0.0;
  }
}
