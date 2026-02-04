/**
 * Depth Estimation Shaders
 * Export WGSL shader code for depth estimation and refinement
 */

import stereoMatchingShader from './depth/stereo-matching.wgsl';
import depthRefinementShader from './depth/depth-refinement.wgsl';

export const depthShaders = {
  stereoMatching: stereoMatchingShader,
  depthRefinement: depthRefinementShader,
};

export { stereoMatchingShader, depthRefinementShader };
