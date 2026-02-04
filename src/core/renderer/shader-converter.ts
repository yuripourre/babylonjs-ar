/**
 * WGSL to GLSL Shader Converter
 * Converts WebGPU WGSL shaders to WebGL2 GLSL shaders
 * Handles compute shader emulation via fragment shaders
 */

export interface ShaderConversionResult {
  vertex: string;
  fragment: string;
  uniforms: string[];
  textures: string[];
}

export class ShaderConverter {
  /**
   * Convert WGSL compute shader to GLSL fragment shader
   */
  static convertComputeToFragment(wgsl: string): ShaderConversionResult {
    // Extract binding information
    const bindings = this.extractBindings(wgsl);

    // Generate GLSL uniforms
    const uniforms: string[] = [];
    const textures: string[] = [];

    for (const binding of bindings) {
      if (binding.type.includes('texture')) {
        textures.push(binding.name);
      } else if (binding.type.includes('storage') || binding.type.includes('uniform')) {
        uniforms.push(binding.name);
      }
    }

    // Generate vertex shader (fullscreen quad)
    const vertex = this.generateFullscreenVertexShader();

    // Convert compute logic to fragment shader
    const fragment = this.convertWGSLToGLSL(wgsl, bindings);

    return {
      vertex,
      fragment,
      uniforms,
      textures,
    };
  }

  /**
   * Extract binding information from WGSL
   */
  private static extractBindings(wgsl: string): Array<{
    group: number;
    binding: number;
    name: string;
    type: string;
  }> {
    const bindings: Array<{ group: number; binding: number; name: string; type: string }> = [];

    // Match @group(0) @binding(0) var name: type;
    const bindingRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var\s+(\w+)\s*:\s*([^;]+);/g;

    let match;
    while ((match = bindingRegex.exec(wgsl)) !== null) {
      bindings.push({
        group: parseInt(match[1]),
        binding: parseInt(match[2]),
        name: match[3],
        type: match[4].trim(),
      });
    }

    return bindings;
  }

  /**
   * Generate fullscreen quad vertex shader
   */
  private static generateFullscreenVertexShader(): string {
    return `#version 300 es
in vec2 position;
out vec2 vUV;

void main() {
  vUV = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;
  }

  /**
   * Convert WGSL compute shader body to GLSL fragment shader
   */
  private static convertWGSLToGLSL(wgsl: string, bindings: any[]): string {
    let glsl = '#version 300 es\nprecision highp float;\n\n';

    // Add texture uniforms
    for (const binding of bindings) {
      if (binding.type.includes('texture_external') || binding.type.includes('texture_2d')) {
        glsl += `uniform sampler2D ${binding.name};\n`;
      } else if (binding.type.includes('texture_storage')) {
        // Storage textures become output
        // Will be handled as fragColor output
      } else if (binding.type.includes('storage')) {
        // Storage buffers need special handling (texture-based in WebGL2)
        glsl += `uniform sampler2D ${binding.name}Buffer;\n`;
      } else if (binding.type.includes('uniform')) {
        glsl += `uniform ${this.convertType(binding.type)} ${binding.name};\n`;
      }
    }

    glsl += '\nin vec2 vUV;\nout vec4 fragColor;\n\n';

    // Extract and convert main function body
    const mainBody = this.extractMainBody(wgsl);
    const convertedBody = this.convertWGSLSyntax(mainBody);

    glsl += 'void main() {\n';
    glsl += '  // Convert UV to pixel coordinates\n';
    glsl += '  vec2 texSize = vec2(textureSize(inputTexture, 0));\n';
    glsl += '  ivec2 coords = ivec2(vUV * texSize);\n\n';
    glsl += convertedBody;
    glsl += '}\n';

    return glsl;
  }

  /**
   * Extract main function body from WGSL
   */
  private static extractMainBody(wgsl: string): string {
    const mainMatch = wgsl.match(/fn\s+main\s*\([^)]*\)\s*\{([\s\S]*)\}/);
    if (!mainMatch) {
      throw new Error('Could not find main function in WGSL');
    }
    return mainMatch[1];
  }

  /**
   * Convert WGSL syntax to GLSL syntax
   */
  private static convertWGSLSyntax(wgsl: string): string {
    let glsl = wgsl;

    // Convert let to vec/float declarations
    glsl = glsl.replace(/let\s+(\w+)\s*=\s*vec2<f32>/g, 'vec2 $1 =');
    glsl = glsl.replace(/let\s+(\w+)\s*=\s*vec3<f32>/g, 'vec3 $1 =');
    glsl = glsl.replace(/let\s+(\w+)\s*=\s*vec4<f32>/g, 'vec4 $1 =');
    glsl = glsl.replace(/let\s+(\w+)\s*=\s*vec2<i32>/g, 'ivec2 $1 =');
    glsl = glsl.replace(/let\s+(\w+)\s*=\s*vec3<i32>/g, 'ivec3 $1 =');

    // Convert type syntax
    glsl = glsl.replace(/f32\(/g, 'float(');
    glsl = glsl.replace(/i32\(/g, 'int(');
    glsl = glsl.replace(/u32\(/g, 'uint(');

    // Convert texture functions
    glsl = glsl.replace(/textureLoad\((\w+),\s*vec2<i32>\(([^)]+)\)\)/g, 'texelFetch($1, ivec2($2), 0)');
    glsl = glsl.replace(/textureLoad\((\w+),\s*([^)]+)\)/g, 'texelFetch($1, ivec2($2), 0)');
    glsl = glsl.replace(/textureDimensions\((\w+)\)/g, 'textureSize($1, 0)');

    // Convert textureStore to output
    glsl = glsl.replace(/textureStore\([^,]+,\s*[^,]+,\s*([^)]+)\);/g, 'fragColor = $1;');

    // Convert global_invocation_id to fragment coordinates
    glsl = glsl.replace(/global_id\.xy/g, 'coords');
    glsl = glsl.replace(/global_id\.x/g, 'coords.x');
    glsl = glsl.replace(/global_id\.y/g, 'coords.y');

    // Convert WGSL types to GLSL types
    glsl = glsl.replace(/vec2<f32>/g, 'vec2');
    glsl = glsl.replace(/vec3<f32>/g, 'vec3');
    glsl = glsl.replace(/vec4<f32>/g, 'vec4');
    glsl = glsl.replace(/vec2<i32>/g, 'ivec2');
    glsl = glsl.replace(/vec3<i32>/g, 'ivec3');
    glsl = glsl.replace(/vec4<i32>/g, 'ivec4');

    // Remove bounds checks (handled by texture sampling in GLSL)
    glsl = glsl.replace(/if\s*\([^)]*>=\s*dims\.[xy][^)]*\)\s*\{\s*return;\s*\}/g, '');

    return glsl;
  }

  /**
   * Convert WGSL type to GLSL type
   */
  private static convertType(wgslType: string): string {
    const typeMap: Record<string, string> = {
      'f32': 'float',
      'i32': 'int',
      'u32': 'uint',
      'vec2<f32>': 'vec2',
      'vec3<f32>': 'vec3',
      'vec4<f32>': 'vec4',
      'mat4x4<f32>': 'mat4',
    };

    return typeMap[wgslType] || wgslType;
  }

  /**
   * Get shader for backend type
   */
  static getShaderForBackend(
    shaderCode: string,
    backendType: 'webgpu' | 'webgl2'
  ): string | ShaderConversionResult {
    if (backendType === 'webgpu') {
      return shaderCode; // Return WGSL as-is
    }

    // Check if already GLSL
    if (shaderCode.includes('#version 300 es')) {
      return shaderCode;
    }

    // Convert WGSL to GLSL
    return this.convertComputeToFragment(shaderCode);
  }
}

/**
 * GLSL Shader Registry
 * Pre-converted shaders for WebGL2 backend
 */
export const GLSLShaders = {
  fullscreenVertex: `#version 300 es
in vec2 position;
out vec2 vUV;

void main() {
  vUV = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`,

  grayscaleFragment: `#version 300 es
precision highp float;

uniform sampler2D inputTexture;
in vec2 vUV;
out vec4 fragColor;

void main() {
  vec4 rgba = texture(inputTexture, vUV);
  float gray = dot(rgba.rgb, vec3(0.299, 0.587, 0.114));
  fragColor = vec4(gray, 0.0, 0.0, 1.0);
}`,
};

/**
 * GLSL Shader File Mapping
 * Maps shader names to their GLSL file paths
 */
export const GLSLShaderFiles: Record<string, string> = {
  'grayscale': '/shaders/glsl/grayscale.glsl',
  'gaussian-blur': '/shaders/glsl/gaussian-blur.glsl',
  'adaptive-threshold': '/shaders/glsl/adaptive-threshold.glsl',
  'fast-corners': '/shaders/glsl/fast-corners.glsl',
  'contour-detection': '/shaders/glsl/contour-detection.glsl',
  'orb-descriptor': '/shaders/glsl/orb-descriptor.glsl',
  'fullscreen-vertex': '/shaders/glsl/fullscreen-vertex.glsl',
};

/**
 * Check if a pre-converted GLSL shader exists
 */
export function hasGLSLShader(shaderName: string): boolean {
  return shaderName in GLSLShaderFiles;
}

/**
 * Get GLSL shader file path
 */
export function getGLSLShaderPath(shaderName: string): string | null {
  return GLSLShaderFiles[shaderName] || null;
}
