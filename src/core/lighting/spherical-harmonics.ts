/**
 * Spherical Harmonics
 * Calculates spherical harmonics coefficients for image-based lighting
 *
 * Uses 3-band SH (9 coefficients per color channel, 27 total)
 * Sufficient for diffuse lighting in real-time applications
 */

import { Vector3 } from '../math/vector';

/**
 * Spherical Harmonics coefficients
 * 9 coefficients per color channel (RGB) = 27 floats total
 *
 * Layout: [R0, R1, R2, ..., R8, G0, G1, ..., G8, B0, B1, ..., B8]
 */
export type SHCoefficients = Float32Array; // length 27

/**
 * Spherical Harmonics calculator
 */
export class SphericalHarmonics {
  /**
   * Calculate SH coefficients from an image
   * Treats image as equirectangular environment map
   */
  calculateFromImage(imageData: ImageData): SHCoefficients {
    const width = imageData.width;
    const height = imageData.height;
    const pixels = imageData.data;

    // Initialize coefficients (9 per channel)
    const coeffs = new Float32Array(27);

    // Accumulation weight for normalization
    let totalWeight = 0;

    // Sample the image and project onto SH basis
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // Get pixel color
        const r = pixels[idx] / 255;
        const g = pixels[idx + 1] / 255;
        const b = pixels[idx + 2] / 255;

        // Convert pixel position to spherical coordinates
        // Treat as equirectangular projection
        const theta = (y / height) * Math.PI;        // 0 to π (top to bottom)
        const phi = (x / width) * Math.PI * 2;       // 0 to 2π (left to right)

        // Convert to Cartesian direction
        const direction = new Vector3(
          Math.sin(theta) * Math.cos(phi),
          Math.cos(theta),
          Math.sin(theta) * Math.sin(phi)
        );

        // Evaluate SH basis functions
        const shBasis = this.evaluateSHBasis(direction);

        // Solid angle weight for integration
        // More weight at poles in equirectangular projection
        const weight = Math.sin(theta);
        totalWeight += weight;

        // Accumulate weighted contribution to each coefficient
        for (let i = 0; i < 9; i++) {
          const basis = shBasis[i] * weight;
          coeffs[i] += r * basis;      // Red channel
          coeffs[i + 9] += g * basis;  // Green channel
          coeffs[i + 18] += b * basis; // Blue channel
        }
      }
    }

    // Normalize by total weight
    if (totalWeight > 0) {
      const normalization = (4 * Math.PI) / totalWeight;
      for (let i = 0; i < 27; i++) {
        coeffs[i] *= normalization;
      }
    }

    return coeffs;
  }

  /**
   * Evaluate spherical harmonics basis functions (bands 0-2, 9 functions)
   * Using real spherical harmonics (Ylm)
   */
  private evaluateSHBasis(direction: Vector3): Float32Array {
    const x = direction.x;
    const y = direction.y;
    const z = direction.z;

    const basis = new Float32Array(9);

    // Constants for SH evaluation
    const c0 = 0.282094792;  // 1 / (2 * sqrt(π))
    const c1 = 0.488602512;  // sqrt(3 / (4π))
    const c2 = 1.092548431;  // sqrt(15 / (4π))
    const c3 = 0.315391565;  // sqrt(5 / (16π))
    const c4 = 0.546274215;  // sqrt(15 / (16π))

    // Band 0 (l=0, constant)
    basis[0] = c0;

    // Band 1 (l=1, linear)
    basis[1] = c1 * y;        // Y(1,-1)
    basis[2] = c1 * z;        // Y(1,0)
    basis[3] = c1 * x;        // Y(1,1)

    // Band 2 (l=2, quadratic)
    basis[4] = c2 * x * y;                    // Y(2,-2)
    basis[5] = c2 * y * z;                    // Y(2,-1)
    basis[6] = c3 * (3 * z * z - 1);          // Y(2,0)
    basis[7] = c2 * x * z;                    // Y(2,1)
    basis[8] = c4 * (x * x - y * y);          // Y(2,2)

    return basis;
  }

  /**
   * Evaluate SH at a given direction (for irradiance lookup)
   * Returns RGB irradiance
   */
  evaluateIrradiance(coeffs: SHCoefficients, direction: Vector3): {
    r: number;
    g: number;
    b: number;
  } {
    const basis = this.evaluateSHBasis(direction);

    let r = 0, g = 0, b = 0;

    // Accumulate weighted basis functions
    for (let i = 0; i < 9; i++) {
      r += coeffs[i] * basis[i];
      g += coeffs[i + 9] * basis[i];
      b += coeffs[i + 18] * basis[i];
    }

    // Clamp to valid range
    return {
      r: Math.max(0, Math.min(1, r)),
      g: Math.max(0, Math.min(1, g)),
      b: Math.max(0, Math.min(1, b)),
    };
  }

  /**
   * Calculate dominant light direction from SH coefficients
   * Uses band 1 coefficients which encode directionality
   */
  getDominantDirection(coeffs: SHCoefficients): Vector3 {
    // Average RGB channels for direction
    const x = (coeffs[3] + coeffs[12] + coeffs[21]) / 3;
    const y = (coeffs[1] + coeffs[10] + coeffs[19]) / 3;
    const z = (coeffs[2] + coeffs[11] + coeffs[20]) / 3;

    const direction = new Vector3(x, y, z);
    const length = direction.length();

    if (length > 0.001) {
      return direction.normalize();
    }

    // Default to up if no clear direction
    return new Vector3(0, 1, 0);
  }

  /**
   * Get ambient intensity from SH coefficients
   * Band 0 represents the DC component (average)
   */
  getAmbientIntensity(coeffs: SHCoefficients): number {
    // Average of band 0 across RGB channels
    const r = coeffs[0];
    const g = coeffs[9];
    const b = coeffs[18];

    // Convert to luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return Math.max(0, Math.min(1, luminance));
  }

  /**
   * Convert SH coefficients to a format suitable for shaders
   * Returns array of Vector3 (one per coefficient)
   */
  toShaderFormat(coeffs: SHCoefficients): Vector3[] {
    const result: Vector3[] = [];

    for (let i = 0; i < 9; i++) {
      result.push(new Vector3(
        coeffs[i],      // Red
        coeffs[i + 9],  // Green
        coeffs[i + 18]  // Blue
      ));
    }

    return result;
  }

  /**
   * Rotate SH coefficients by a rotation matrix
   * Useful when camera orientation changes
   * Note: Only rotates band 1 (linear terms) for simplicity
   */
  rotate(coeffs: SHCoefficients, rotationMatrix: Float32Array): SHCoefficients {
    const rotated = new Float32Array(coeffs);

    // Only rotate band 1 (indices 1-3 for each channel)
    // Band 0 is invariant to rotation
    // Band 2 rotation is complex, skipped for performance

    for (let channel = 0; channel < 3; channel++) {
      const offset = channel * 9;

      const y = coeffs[offset + 1];
      const z = coeffs[offset + 2];
      const x = coeffs[offset + 3];

      // Apply rotation matrix (assuming 3x3 rotation part)
      rotated[offset + 1] = rotationMatrix[0] * x + rotationMatrix[1] * y + rotationMatrix[2] * z;
      rotated[offset + 2] = rotationMatrix[3] * x + rotationMatrix[4] * y + rotationMatrix[5] * z;
      rotated[offset + 3] = rotationMatrix[6] * x + rotationMatrix[7] * y + rotationMatrix[8] * z;
    }

    return rotated;
  }

  /**
   * Interpolate between two SH coefficient sets
   */
  lerp(a: SHCoefficients, b: SHCoefficients, t: number): SHCoefficients {
    const result = new Float32Array(27);

    for (let i = 0; i < 27; i++) {
      result[i] = a[i] + (b[i] - a[i]) * t;
    }

    return result;
  }

  /**
   * Create default SH coefficients (neutral white lighting from above)
   */
  static createDefault(): SHCoefficients {
    const coeffs = new Float32Array(27);

    // Band 0: constant ambient (moderate brightness)
    coeffs[0] = 0.5;  // R
    coeffs[9] = 0.5;  // G
    coeffs[18] = 0.5; // B

    // Band 1: light from above (positive Y)
    coeffs[1] = 0.3;  // R
    coeffs[10] = 0.3; // G
    coeffs[19] = 0.3; // B

    return coeffs;
  }

  /**
   * Create SH coefficients for a single directional light
   * Useful for debugging or simple scenarios
   */
  static createDirectional(
    direction: Vector3,
    color: { r: number; g: number; b: number },
    intensity: number
  ): SHCoefficients {
    const sh = new SphericalHarmonics();
    const basis = sh.evaluateSHBasis(direction.normalize());

    const coeffs = new Float32Array(27);

    for (let i = 0; i < 9; i++) {
      coeffs[i] = color.r * intensity * basis[i];
      coeffs[i + 9] = color.g * intensity * basis[i];
      coeffs[i + 18] = color.b * intensity * basis[i];
    }

    return coeffs;
  }
}
