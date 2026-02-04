// Homography Computation on GPU
// Computes perspective transformation matrix from quad to square
// Uses Direct Linear Transform (DLT) algorithm

@group(0) @binding(0) var<storage, read> srcPoints: array<vec2<f32>>; // 4 source points
@group(0) @binding(1) var<storage, read> dstPoints: array<vec2<f32>>; // 4 destination points
@group(0) @binding(2) var<storage, read_write> homography: array<f32>; // 9 elements (3x3 matrix)
@group(0) @binding(3) var<uniform> params: HomographyParams;

struct HomographyParams {
  quadIndex: u32,  // Which quad we're processing
  _padding: vec3<u32>,
}

// Solve Ax = 0 using DLT (Direct Linear Transform)
// Build 8x9 matrix A from point correspondences
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = params.quadIndex;
  let offset = idx * 4u;

  // Build matrix A (8x9)
  // Each point correspondence gives 2 rows
  var A: array<array<f32, 9>, 8>;

  for (var i = 0u; i < 4u; i++) {
    let src = srcPoints[offset + i];
    let dst = dstPoints[offset + i];

    let x = src.x;
    let y = src.y;
    let xp = dst.x;
    let yp = dst.y;

    // Row 2i: -x, -y, -1, 0, 0, 0, x*xp, y*xp, xp
    let row1 = i * 2u;
    A[row1][0] = -x;
    A[row1][1] = -y;
    A[row1][2] = -1.0;
    A[row1][3] = 0.0;
    A[row1][4] = 0.0;
    A[row1][5] = 0.0;
    A[row1][6] = x * xp;
    A[row1][7] = y * xp;
    A[row1][8] = xp;

    // Row 2i+1: 0, 0, 0, -x, -y, -1, x*yp, y*yp, yp
    let row2 = row1 + 1u;
    A[row2][0] = 0.0;
    A[row2][1] = 0.0;
    A[row2][2] = 0.0;
    A[row2][3] = -x;
    A[row2][4] = -y;
    A[row2][5] = -1.0;
    A[row2][6] = x * yp;
    A[row2][7] = y * yp;
    A[row2][8] = yp;
  }

  // Solve using simplified SVD (smallest eigenvalue)
  // For 4-point homography, we can use a direct method
  // Simplified: compute AtA and find eigenvector for smallest eigenvalue

  // Build AtA (9x9 symmetric matrix)
  var AtA: array<array<f32, 9>, 9>;

  for (var i = 0u; i < 9u; i++) {
    for (var j = 0u; j < 9u; j++) {
      var sum = 0.0;
      for (var k = 0u; k < 8u; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum;
    }
  }

  // Power iteration to find smallest eigenvector
  // (Simplified - in practice would use full SVD)
  var h: array<f32, 9>;

  // Initialize with random vector
  for (var i = 0u; i < 9u; i++) {
    h[i] = 1.0 / 9.0;
  }

  // Inverse power iteration (finds smallest eigenvalue)
  for (var iter = 0u; iter < 20u; iter++) {
    // Solve AtA * h_new = h_old (approximately)
    // Using Gauss-Seidel iteration for simplicity
    var h_new: array<f32, 9>;

    for (var i = 0u; i < 9u; i++) {
      var sum = 0.0;
      for (var j = 0u; j < 9u; j++) {
        if (i != j) {
          sum += AtA[i][j] * h[j];
        }
      }

      if (abs(AtA[i][i]) > 0.0001) {
        h_new[i] = (h[i] - sum) / AtA[i][i];
      } else {
        h_new[i] = h[i];
      }
    }

    // Normalize
    var norm = 0.0;
    for (var i = 0u; i < 9u; i++) {
      norm += h_new[i] * h_new[i];
    }
    norm = sqrt(norm);

    for (var i = 0u; i < 9u; i++) {
      h[i] = h_new[i] / norm;
    }
  }

  // Store result
  let outOffset = idx * 9u;
  for (var i = 0u; i < 9u; i++) {
    homography[outOffset + i] = h[i];
  }
}

// Alternative: Direct 4-point homography (faster but less general)
@compute @workgroup_size(1)
fn computeDirect(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = params.quadIndex;
  let offset = idx * 4u;

  // Get points
  let p0 = srcPoints[offset + 0u];
  let p1 = srcPoints[offset + 1u];
  let p2 = srcPoints[offset + 2u];
  let p3 = srcPoints[offset + 3u];

  let q0 = dstPoints[offset + 0u];
  let q1 = dstPoints[offset + 1u];
  let q2 = dstPoints[offset + 2u];
  let q3 = dstPoints[offset + 3u];

  // Direct computation for quad-to-square
  // Using closed-form solution for 4 points

  let dx1 = p1.x - p2.x;
  let dx2 = p3.x - p2.x;
  let sx = p0.x - p1.x + p2.x - p3.x;

  let dy1 = p1.y - p2.y;
  let dy2 = p3.y - p2.y;
  let sy = p0.y - p1.y + p2.y - p3.y;

  let denom = dx1 * dy2 - dx2 * dy1;

  var h: array<f32, 9>;

  if (abs(denom) > 0.0001) {
    let g = (sx * dy2 - sy * dx2) / denom;
    let h_val = (dx1 * sy - dy1 * sx) / denom;

    h[0] = p1.x - p0.x + g * p1.x;
    h[1] = p3.x - p0.x + h_val * p3.x;
    h[2] = p0.x;
    h[3] = p1.y - p0.y + g * p1.y;
    h[4] = p3.y - p0.y + h_val * p3.y;
    h[5] = p0.y;
    h[6] = g;
    h[7] = h_val;
    h[8] = 1.0;
  } else {
    // Degenerate case - return identity
    h[0] = 1.0;
    h[1] = 0.0;
    h[2] = 0.0;
    h[3] = 0.0;
    h[4] = 1.0;
    h[5] = 0.0;
    h[6] = 0.0;
    h[7] = 0.0;
    h[8] = 1.0;
  }

  // Store result
  let outOffset = idx * 9u;
  for (var i = 0u; i < 9u; i++) {
    homography[outOffset + i] = h[i];
  }
}
