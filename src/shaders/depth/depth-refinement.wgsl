// Depth Refinement Shader
// Applies bilateral filtering and guided upsampling for high-quality depth

@group(0) @binding(0) var depthInput: texture_2d<f32>;
@group(0) @binding(1) var colorGuide: texture_2d<f32>; // RGB guide image
@group(0) @binding(2) var depthOutput: texture_storage_2d<r32float, write>;
@group(0) @binding(3) var<uniform> params: RefinementParams;

struct RefinementParams {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  spatialSigma: f32,
  rangeSigma: f32,
  kernelRadius: u32,
  _padding: u32,
}

// Bilateral filter: edge-preserving smoothing
// Weights based on spatial distance AND color/depth similarity
@compute @workgroup_size(16, 16)
fn bilateralFilter(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let outCoord = vec2<i32>(global_id.xy);

  if (global_id.x >= params.outputWidth || global_id.y >= params.outputHeight) {
    return;
  }

  // Map output coordinate to input coordinate (for upsampling)
  let scaleX = f32(params.inputWidth) / f32(params.outputWidth);
  let scaleY = f32(params.inputHeight) / f32(params.outputHeight);
  let inX = i32(f32(global_id.x) * scaleX);
  let inY = i32(f32(global_id.y) * scaleY);
  let inCoord = vec2<i32>(inX, inY);

  // Get center depth and color
  let centerDepth = textureLoad(depthInput, inCoord, 0).r;
  let centerColor = textureLoad(colorGuide, outCoord, 0).rgb;

  // Skip invalid depths
  if (centerDepth <= 0.0 || centerDepth > 10.0) {
    textureStore(depthOutput, outCoord, vec4<f32>(0.0));
    return;
  }

  // Bilateral filter
  var weightSum = 0.0;
  var depthSum = 0.0;
  let radius = i32(params.kernelRadius);

  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      let sampleCoord = inCoord + vec2<i32>(dx, dy);

      // Bounds check
      if (sampleCoord.x < 0 || sampleCoord.x >= i32(params.inputWidth) ||
          sampleCoord.y < 0 || sampleCoord.y >= i32(params.inputHeight)) {
        continue;
      }

      let sampleDepth = textureLoad(depthInput, sampleCoord, 0).r;

      // Skip invalid samples
      if (sampleDepth <= 0.0 || sampleDepth > 10.0) {
        continue;
      }

      // Get color at corresponding output position
      let outSampleX = i32(f32(sampleCoord.x) / scaleX);
      let outSampleY = i32(f32(sampleCoord.y) / scaleY);
      let outSampleCoord = vec2<i32>(outSampleX, outSampleY);

      // Clamp to output bounds
      let clampedOutCoord = vec2<i32>(
        clamp(outSampleCoord.x, 0, i32(params.outputWidth) - 1),
        clamp(outSampleCoord.y, 0, i32(params.outputHeight) - 1)
      );

      let sampleColor = textureLoad(colorGuide, clampedOutCoord, 0).rgb;

      // Spatial weight (Gaussian)
      let spatialDist = f32(dx * dx + dy * dy);
      let spatialWeight = exp(-spatialDist / (2.0 * params.spatialSigma * params.spatialSigma));

      // Range weight (depth difference)
      let depthDiff = abs(sampleDepth - centerDepth);
      let depthWeight = exp(-depthDiff * depthDiff / (2.0 * params.rangeSigma * params.rangeSigma));

      // Color similarity weight
      let colorDiff = length(sampleColor - centerColor);
      let colorWeight = exp(-colorDiff * colorDiff / (2.0 * 0.1 * 0.1));

      // Combined weight
      let weight = spatialWeight * depthWeight * colorWeight;

      weightSum += weight;
      depthSum += sampleDepth * weight;
    }
  }

  // Normalize
  let refinedDepth = select(centerDepth, depthSum / weightSum, weightSum > 0.001);
  textureStore(depthOutput, outCoord, vec4<f32>(refinedDepth));
}

// Guided upsampling: use high-res color to guide low-res depth upsampling
@compute @workgroup_size(16, 16)
fn guidedUpsample(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let outCoord = vec2<i32>(global_id.xy);

  if (global_id.x >= params.outputWidth || global_id.y >= params.outputHeight) {
    return;
  }

  // Map to input space (bilinear interpolation)
  let scaleX = f32(params.inputWidth) / f32(params.outputWidth);
  let scaleY = f32(params.inputHeight) / f32(params.outputHeight);
  let inX = f32(global_id.x) * scaleX;
  let inY = f32(global_id.y) * scaleY;

  // Get 4 nearest depth samples
  let x0 = i32(floor(inX));
  let y0 = i32(floor(inY));
  let x1 = min(x0 + 1, i32(params.inputWidth) - 1);
  let y1 = min(y0 + 1, i32(params.inputHeight) - 1);

  let fx = fract(inX);
  let fy = fract(inY);

  let d00 = textureLoad(depthInput, vec2<i32>(x0, y0), 0).r;
  let d10 = textureLoad(depthInput, vec2<i32>(x1, y0), 0).r;
  let d01 = textureLoad(depthInput, vec2<i32>(x0, y1), 0).r;
  let d11 = textureLoad(depthInput, vec2<i32>(x1, y1), 0).r;

  // Get color at this pixel and neighbors
  let centerColor = textureLoad(colorGuide, outCoord, 0).rgb;

  // Get colors at corresponding input positions
  let color00 = textureLoad(colorGuide, vec2<i32>(i32(f32(x0) / scaleX), i32(f32(y0) / scaleY)), 0).rgb;
  let color10 = textureLoad(colorGuide, vec2<i32>(i32(f32(x1) / scaleX), i32(f32(y0) / scaleY)), 0).rgb;
  let color01 = textureLoad(colorGuide, vec2<i32>(i32(f32(x0) / scaleX), i32(f32(y1) / scaleY)), 0).rgb;
  let color11 = textureLoad(colorGuide, vec2<i32>(i32(f32(x1) / scaleX), i32(f32(y1) / scaleY)), 0).rgb;

  // Weight by color similarity
  let w00 = select(0.0, exp(-length(centerColor - color00) * 10.0), d00 > 0.0);
  let w10 = select(0.0, exp(-length(centerColor - color10) * 10.0), d10 > 0.0);
  let w01 = select(0.0, exp(-length(centerColor - color01) * 10.0), d01 > 0.0);
  let w11 = select(0.0, exp(-length(centerColor - color11) * 10.0), d11 > 0.0);

  let weightSum = w00 + w10 + w01 + w11;

  var depth: f32;
  if (weightSum > 0.001) {
    // Color-guided interpolation
    depth = (d00 * w00 + d10 * w10 + d01 * w01 + d11 * w11) / weightSum;
  } else {
    // Fallback to bilinear
    let d0 = mix(d00, d10, fx);
    let d1 = mix(d01, d11, fx);
    depth = mix(d0, d1, fy);
  }

  textureStore(depthOutput, outCoord, vec4<f32>(depth));
}
