/**
 * Plane Detection Shaders
 * Export WGSL shader code for plane detection pipeline
 */

import normalEstimationShader from './planes/normal-estimation.wgsl';
import planeFittingShader from './planes/plane-fitting.wgsl';
import planeRefinementShader from './planes/plane-refinement.wgsl';

export const planeShaders = {
  normalEstimation: normalEstimationShader,
  planeFitting: planeFittingShader,
  planeRefinement: planeRefinementShader,
};

export { normalEstimationShader, planeFittingShader, planeRefinementShader };
