/**
 * Lighting Estimation Shaders
 * Export WGSL shader code for spherical harmonics light estimation
 */

import sphericalHarmonicsShader from './lighting/spherical-harmonics.wgsl';

export const lightingShaders = {
  sphericalHarmonics: sphericalHarmonicsShader,
};

export { sphericalHarmonicsShader };
