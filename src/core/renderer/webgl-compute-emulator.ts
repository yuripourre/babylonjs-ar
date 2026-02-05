/**
 * WebGL2 Compute Emulator
 * Emulates compute shader functionality using fragment shaders and render-to-texture
 *
 * WebGL2 doesn't have native compute shaders, so we:
 * 1. Draw a fullscreen quad
 * 2. Run fragment shader (emulates compute)
 * 3. Render to texture (output)
 */

export class WebGLComputeEmulator {
  private gl: WebGL2RenderingContext;
  private fullscreenQuad: {
    vao: WebGLVertexArrayObject;
    vbo: WebGLBuffer;
  } | null = null;

  private framebuffers = new Map<string, WebGLFramebuffer>();
  private currentProgram: WebGLProgram | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initializeFullscreenQuad();
  }

  /**
   * Initialize fullscreen quad for compute emulation
   */
  private initializeFullscreenQuad(): void {
    const gl = this.gl;

    // Create VAO
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');

    gl.bindVertexArray(vao);

    // Create VBO with fullscreen quad vertices
    const vertices = new Float32Array([
      -1, -1, // Bottom-left
      1, -1,  // Bottom-right
      -1, 1,  // Top-left
      1, 1,   // Top-right
    ]);

    const vbo = gl.createBuffer();
    if (!vbo) throw new Error('Failed to create VBO');

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Setup position attribute (location 0)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.fullscreenQuad = { vao, vbo };
  }

  /**
   * Execute compute pass (fragment shader on fullscreen quad)
   */
  executeCompute(
    program: WebGLProgram,
    outputTexture: WebGLTexture,
    width: number,
    height: number,
    uniforms?: Record<string, any>
  ): void {
    const gl = this.gl;

    // Get or create framebuffer for output texture
    const fbo = this.getFramebuffer(outputTexture);

    // Bind framebuffer and attach output texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      outputTexture,
      0
    );

    // Check framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incomplete: ${status}`);
    }

    // Set viewport
    gl.viewport(0, 0, width, height);

    // Use shader program
    gl.useProgram(program);
    this.currentProgram = program;

    // Bind uniforms
    if (uniforms) {
      this.bindUniforms(program, uniforms);
    }

    // Draw fullscreen quad
    if (this.fullscreenQuad) {
      gl.bindVertexArray(this.fullscreenQuad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Bind uniforms to shader program
   */
  private bindUniforms(program: WebGLProgram, uniforms: Record<string, any>): void {
    const gl = this.gl;

    let textureUnit = 0;

    for (const [name, value] of Object.entries(uniforms)) {
      const location = gl.getUniformLocation(program, name);
      if (!location) continue;

      // Handle different uniform types
      if (value instanceof WebGLTexture) {
        // Bind texture
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, value);
        gl.uniform1i(location, textureUnit);
        textureUnit++;
      } else if (typeof value === 'number') {
        gl.uniform1f(location, value);
      } else if (Array.isArray(value)) {
        // Handle vector uniforms
        switch (value.length) {
          case 2:
            gl.uniform2fv(location, value);
            break;
          case 3:
            gl.uniform3fv(location, value);
            break;
          case 4:
            gl.uniform4fv(location, value);
            break;
        }
      } else if (value instanceof Float32Array) {
        // Handle typed arrays
        if (value.length === 16) {
          gl.uniformMatrix4fv(location, false, value);
        } else {
          gl.uniform1fv(location, value);
        }
      }
    }
  }

  /**
   * Get or create framebuffer for texture
   */
  private getFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const key = this.getTextureKey(texture);
    let fbo = this.framebuffers.get(key);

    if (!fbo) {
      fbo = this.gl.createFramebuffer();
      if (!fbo) throw new Error('Failed to create framebuffer');
      this.framebuffers.set(key, fbo);
    }

    return fbo;
  }

  /**
   * Get unique key for texture (for caching)
   */
  private getTextureKey(texture: WebGLTexture): string {
    // Use WebGL internal ID (not perfect, but works for caching)
    // TypeScript doesn't know about __id, but it exists in some implementations
    const textureWithId = texture as unknown as { __id?: number };
    return `tex_${textureWithId.__id || Math.random()}`;
  }

  /**
   * Read pixels from texture (for debugging/readback)
   */
  readPixels(
    texture: WebGLTexture,
    width: number,
    height: number,
    format: number = this.gl.RGBA,
    type: number = this.gl.UNSIGNED_BYTE
  ): ArrayBufferView {
    const gl = this.gl;
    const fbo = this.getFramebuffer(texture);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );

    // Allocate buffer based on format
    let buffer: ArrayBufferView;
    const pixelCount = width * height;

    if (type === gl.UNSIGNED_BYTE) {
      const channels = format === gl.RGBA ? 4 : format === gl.RGB ? 3 : 1;
      buffer = new Uint8Array(pixelCount * channels);
    } else if (type === gl.FLOAT) {
      const channels = format === gl.RGBA ? 4 : format === gl.RGB ? 3 : 1;
      buffer = new Float32Array(pixelCount * channels);
    } else {
      buffer = new Uint8Array(pixelCount * 4); // Default
    }

    gl.readPixels(0, 0, width, height, format, type, buffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return buffer;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    const gl = this.gl;

    // Delete framebuffers
    for (const fbo of this.framebuffers.values()) {
      gl.deleteFramebuffer(fbo);
    }
    this.framebuffers.clear();

    // Delete fullscreen quad
    if (this.fullscreenQuad) {
      gl.deleteVertexArray(this.fullscreenQuad.vao);
      gl.deleteBuffer(this.fullscreenQuad.vbo);
      this.fullscreenQuad = null;
    }
  }
}

/**
 * Compute Pass Descriptor for WebGL2
 */
export interface WebGLComputePassDescriptor {
  program: WebGLProgram;
  outputTexture: WebGLTexture;
  outputWidth: number;
  outputHeight: number;
  uniforms?: Record<string, any>;
}

/**
 * Batch multiple compute passes for efficiency
 */
export class WebGLComputeBatch {
  private passes: WebGLComputePassDescriptor[] = [];
  private emulator: WebGLComputeEmulator;

  constructor(emulator: WebGLComputeEmulator) {
    this.emulator = emulator;
  }

  /**
   * Add compute pass to batch
   */
  addPass(descriptor: WebGLComputePassDescriptor): void {
    this.passes.push(descriptor);
  }

  /**
   * Execute all passes in order
   */
  execute(): void {
    for (const pass of this.passes) {
      this.emulator.executeCompute(
        pass.program,
        pass.outputTexture,
        pass.outputWidth,
        pass.outputHeight,
        pass.uniforms
      );
    }

    this.passes = []; // Clear after execution
  }
}
