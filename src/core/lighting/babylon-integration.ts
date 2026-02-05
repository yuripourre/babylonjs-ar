/**
 * Babylon.js Light Estimation Integration
 * Helpers to apply light estimation to Babylon.js scenes
 */

import type { LightEstimate } from './light-estimator';
import type { SHCoefficients } from './spherical-harmonics';
import { Vector3 } from '../math/vector';

/**
 * Babylon.js integration helpers
 * Note: These use 'any' types for Babylon.js objects to avoid hard dependency
 */
export class BabylonLightingIntegration {
  /**
   * Apply light estimate to Babylon.js scene
   * Updates ambient light, primary directional light, and PBR environment
   */
  static applyToScene(scene: any, estimate: LightEstimate): void {
    // Update or create primary directional light
    this.updateDirectionalLight(scene, estimate);

    // Update ambient/hemisphere light
    this.updateAmbientLight(scene, estimate);

    // Update PBR environment (if PBR materials are used)
    if (scene.environmentTexture || estimate.sphericalHarmonics) {
      this.updatePBREnvironment(scene, estimate);
    }
  }

  /**
   * Update or create directional light for primary light source
   */
  private static updateDirectionalLight(scene: any, estimate: LightEstimate): void {
    // Find existing AR directional light or create one
    let light = scene.getLightByName('ar-primary-light');

    if (!light) {
      // Create new directional light
      // Assuming BABYLON is globally available
      const BABYLON = (globalThis as any).BABYLON;
      if (!BABYLON) {
        console.warn('Babylon.js not found, skipping light creation');
        return;
      }

      light = new BABYLON.DirectionalLight(
        'ar-primary-light',
        new BABYLON.Vector3(0, -1, 0),
        scene
      );
    }

    // Update direction (light points opposite to direction)
    const dir = estimate.primaryDirection;
    light.direction.set(-dir.x, -dir.y, -dir.z);

    // Update intensity
    light.intensity = estimate.primaryIntensity * 2.0; // Scale for visibility

    // Update color
    const color = estimate.primaryColor;
    light.diffuse.set(color.r, color.g, color.b);
    light.specular.set(color.r * 0.5, color.g * 0.5, color.b * 0.5);

    // Enable shadows if not already
    if (!light.getShadowGenerator()) {
      // Shadow generator should be created by user if needed
      // We don't create it automatically as it's expensive
    }
  }

  /**
   * Update ambient/hemisphere light
   */
  private static updateAmbientLight(scene: any, estimate: LightEstimate): void {
    // Find existing AR hemisphere light or create one
    let hemiLight = scene.getLightByName('ar-ambient-light');

    if (!hemiLight) {
      const BABYLON = (globalThis as any).BABYLON;
      if (!BABYLON) return;

      // Create hemisphere light (simulates sky + ground bounce)
      hemiLight = new BABYLON.HemisphericLight(
        'ar-ambient-light',
        new BABYLON.Vector3(0, 1, 0),
        scene
      );
    }

    // Update intensity
    hemiLight.intensity = estimate.ambientIntensity;

    // Update colors based on color temperature
    const color = estimate.primaryColor;

    // Sky color (slightly cooler/bluer)
    hemiLight.diffuse.set(
      color.r * 0.8 + 0.2,
      color.g * 0.8 + 0.2,
      color.b * 0.9 + 0.1
    );

    // Ground color (slightly warmer)
    hemiLight.groundColor.set(
      color.r * 0.6,
      color.g * 0.5,
      color.b * 0.4
    );
  }

  /**
   * Update PBR environment for realistic rendering
   */
  private static updatePBREnvironment(scene: any, estimate: LightEstimate): void {
    const BABYLON = (globalThis as any).BABYLON;
    if (!BABYLON) return;

    // Set ambient color for non-PBR materials
    scene.ambientColor.set(
      estimate.primaryColor.r * estimate.ambientIntensity,
      estimate.primaryColor.g * estimate.ambientIntensity,
      estimate.primaryColor.b * estimate.ambientIntensity
    );

    // For PBR materials, we would ideally create an environment texture
    // from the spherical harmonics, but that requires more complex processing
    // For now, adjust the environment intensity
    if (scene.environmentTexture) {
      scene.environmentIntensity = estimate.ambientIntensity * 1.5;
    }
  }

  /**
   * Apply SH coefficients to custom PBR shader
   * Returns shader code snippet for vertex/fragment shader
   */
  static generateSHShaderCode(coeffs: SHCoefficients): string {
    // Convert SH coefficients to GLSL uniform declarations
    let shaderCode = '// Spherical Harmonics coefficients\n';
    shaderCode += 'uniform vec3 shCoeffs[9];\n\n';

    shaderCode += '// Evaluate SH irradiance for a given normal\n';
    shaderCode += 'vec3 evaluateSH(vec3 normal) {\n';
    shaderCode += '  vec3 result = vec3(0.0);\n';
    shaderCode += '  \n';
    shaderCode += '  // Band 0\n';
    shaderCode += '  result += shCoeffs[0] * 0.282095;\n';
    shaderCode += '  \n';
    shaderCode += '  // Band 1\n';
    shaderCode += '  result += shCoeffs[1] * 0.488603 * normal.y;\n';
    shaderCode += '  result += shCoeffs[2] * 0.488603 * normal.z;\n';
    shaderCode += '  result += shCoeffs[3] * 0.488603 * normal.x;\n';
    shaderCode += '  \n';
    shaderCode += '  // Band 2\n';
    shaderCode += '  result += shCoeffs[4] * 1.092548 * normal.x * normal.y;\n';
    shaderCode += '  result += shCoeffs[5] * 1.092548 * normal.y * normal.z;\n';
    shaderCode += '  result += shCoeffs[6] * 0.315392 * (3.0 * normal.z * normal.z - 1.0);\n';
    shaderCode += '  result += shCoeffs[7] * 1.092548 * normal.x * normal.z;\n';
    shaderCode += '  result += shCoeffs[8] * 0.546274 * (normal.x * normal.x - normal.y * normal.y);\n';
    shaderCode += '  \n';
    shaderCode += '  return max(result, vec3(0.0));\n';
    shaderCode += '}\n';

    return shaderCode;
  }

  /**
   * Convert our Vector3 to Babylon Vector3
   */
  static toBabylonVector3(vec: Vector3): any {
    const BABYLON = (globalThis as any).BABYLON;
    if (!BABYLON) {
      throw new Error('Babylon.js not loaded');
    }
    return new BABYLON.Vector3(vec.x, vec.y, vec.z);
  }

  /**
   * Convert SH coefficients to Babylon format (array of Vector3)
   */
  static toBabylonSHFormat(coeffs: SHCoefficients): any[] {
    const BABYLON = (globalThis as any).BABYLON;
    if (!BABYLON) {
      throw new Error('Babylon.js not loaded');
    }

    const result: any[] = [];
    for (let i = 0; i < 9; i++) {
      result.push(new BABYLON.Vector3(
        coeffs[i],      // R
        coeffs[i + 9],  // G
        coeffs[i + 18]  // B
      ));
    }
    return result;
  }

  /**
   * Create a simple environment from light estimate
   * Returns a cube texture that can be used as environment
   */
  static createEnvironmentTexture(scene: any, estimate: LightEstimate): any {
    const BABYLON = (globalThis as any).BABYLON;
    if (!BABYLON) return null;

    // For now, create a simple solid color texture
    // A full implementation would generate a cube map from SH coefficients

    const size = 256;
    const texture = new BABYLON.RawTexture.CreateRGBTexture(
      new Uint8Array(size * size * 3).fill(
        Math.floor(estimate.ambientIntensity * 255)
      ),
      size,
      size,
      scene,
      false,
      false,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE
    );

    return texture;
  }

  /**
   * Apply light estimate to all PBR materials in scene
   */
  static applyToPBRMaterials(scene: any, estimate: LightEstimate): void {
    const BABYLON = (globalThis as any).BABYLON;
    if (!BABYLON) return;

    scene.materials.forEach((material: any) => {
      if (material.getClassName() === 'PBRMaterial' ||
          material.getClassName() === 'PBRMetallicRoughnessMaterial') {

        // Adjust environment intensity
        material.environmentIntensity = estimate.ambientIntensity * 1.5;

        // Adjust direct intensity (if property exists)
        if (material.directIntensity !== undefined) {
          material.directIntensity = estimate.primaryIntensity;
        }
      }
    });
  }

  /**
   * Create debug visualization of light direction
   */
  static createDebugVisualization(scene: any, estimate: LightEstimate): any {
    const BABYLON = (globalThis as any).BABYLON;
    if (!BABYLON) return null;

    // Create an arrow showing light direction
    const dir = estimate.primaryDirection;
    const origin = new BABYLON.Vector3(0, 0, 0);
    const direction = new BABYLON.Vector3(dir.x, dir.y, dir.z);

    const arrow = BABYLON.MeshBuilder.CreateLines(
      'light-debug-arrow',
      {
        points: [
          origin,
          direction.scale(2),
        ],
      },
      scene
    );

    arrow.color = new BABYLON.Color3(
      estimate.primaryColor.r,
      estimate.primaryColor.g,
      estimate.primaryColor.b
    );

    return arrow;
  }
}
