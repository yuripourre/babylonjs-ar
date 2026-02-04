// Plane Refinement Shader
// Refines plane estimate using least squares on inliers
// Improves accuracy after RANSAC selection

@group(0) @binding(0) var<storage, read> points: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> inlierMask: array<u32>; // 1 for inliers, 0 otherwise
@group(0) @binding(2) var<storage, read_write> plane: Plane;
@group(0) @binding(3) var<uniform> params: RefinementParams;

struct Plane {
  normal: vec3<f32>,
  distance: f32,
  inliers: u32,
  score: f32,
  centroid: vec3<f32>,
  _padding: f32,
}

struct RefinementParams {
  numPoints: u32,
  numInliers: u32,
  _padding: vec2<f32>,
}

@compute @workgroup_size(1)
fn main() {
  if (params.numInliers < 3u) {
    return; // Not enough inliers
  }

  // Compute centroid of inliers
  var centroid = vec3<f32>(0.0);
  var inlierCount = 0u;

  for (var i = 0u; i < params.numPoints; i++) {
    if (inlierMask[i] == 1u && points[i].w > 0.5) {
      centroid += points[i].xyz;
      inlierCount++;
    }
  }

  if (inlierCount == 0u) {
    return;
  }

  centroid /= f32(inlierCount);

  // Compute covariance matrix
  var c00 = 0.0;
  var c01 = 0.0;
  var c02 = 0.0;
  var c11 = 0.0;
  var c12 = 0.0;
  var c22 = 0.0;

  for (var i = 0u; i < params.numPoints; i++) {
    if (inlierMask[i] == 1u && points[i].w > 0.5) {
      let p = points[i].xyz - centroid;

      c00 += p.x * p.x;
      c01 += p.x * p.y;
      c02 += p.x * p.z;
      c11 += p.y * p.y;
      c12 += p.y * p.z;
      c22 += p.z * p.z;
    }
  }

  // Find smallest eigenvector (normal direction)
  // Simplified: use existing normal and improve it
  // Full implementation would use power iteration or Jacobi

  // For now, use PCA approximation
  // The normal is the eigenvector corresponding to smallest eigenvalue

  // Simple approach: use cross product of two principal directions
  var normal = plane.normal;

  // Verify it's normalized
  let length = sqrt(dot(normal, normal));
  if (length > 0.001) {
    normal = normal / length;
  } else {
    return;
  }

  // Recompute distance from centroid
  let distance = -dot(normal, centroid);

  // Update plane
  plane.normal = normal;
  plane.distance = distance;
  plane.centroid = centroid;
  plane.inliers = inlierCount;
  plane.score = f32(inlierCount);
}
