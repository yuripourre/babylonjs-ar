/**
 * AR Error Handling
 * Developer-friendly error messages and diagnostics
 */

export class ARError extends Error {
  constructor(
    message: string,
    public code: string,
    public solution?: string,
    public docs?: string
  ) {
    super(message);
    this.name = 'ARError';
  }

  /**
   * Get formatted error message with solution
   */
  getFullMessage(): string {
    let msg = `[${this.code}] ${this.message}`;
    if (this.solution) {
      msg += `\n\n💡 Solution: ${this.solution}`;
    }
    if (this.docs) {
      msg += `\n📚 Docs: ${this.docs}`;
    }
    return msg;
  }
}

/**
 * Common AR errors with helpful messages
 */
export const ARErrors = {
  WebGPUNotSupported: () =>
    new ARError(
      'WebGPU is not supported in this browser',
      'WEBGPU_NOT_SUPPORTED',
      'Use Chrome 113+, Edge 113+, or Safari 18+. Enable chrome://flags/#enable-unsafe-webgpu on older versions.',
      'https://caniuse.com/webgpu'
    ),

  CameraPermissionDenied: () =>
    new ARError(
      'Camera permission was denied',
      'CAMERA_PERMISSION_DENIED',
      'Grant camera permission in browser settings or when prompted.',
      'https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia'
    ),

  CameraNotFound: () =>
    new ARError(
      'No camera device found',
      'CAMERA_NOT_FOUND',
      'Ensure a webcam is connected. Check browser permissions and device manager.',
      'https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia'
    ),

  GPUContextLost: () =>
    new ARError(
      'GPU context was lost',
      'GPU_CONTEXT_LOST',
      'This can happen due to driver crashes or resource exhaustion. Refresh the page to recover.',
      'https://www.w3.org/TR/webgpu/#gpudevice-lost'
    ),

  InvalidConfiguration: (details: string) =>
    new ARError(
      `Invalid configuration: ${details}`,
      'INVALID_CONFIGURATION',
      'Check the configuration object for typos or invalid values.',
      undefined
    ),

  InitializationFailed: (reason: string) =>
    new ARError(
      `AR Engine initialization failed: ${reason}`,
      'INITIALIZATION_FAILED',
      'Check console for detailed error logs. Ensure WebGPU is supported and camera is accessible.',
      undefined
    ),

  MarkerDetectionFailed: (reason: string) =>
    new ARError(
      `Marker detection failed: ${reason}`,
      'MARKER_DETECTION_FAILED',
      'Ensure markers are well-lit, in focus, and use a supported ArUco dictionary.',
      undefined
    ),

  PlaneDetectionFailed: (reason: string) =>
    new ARError(
      `Plane detection failed: ${reason}`,
      'PLANE_DETECTION_FAILED',
      'Ensure the scene has sufficient texture and features for plane detection.',
      undefined
    ),

  OutOfMemory: () =>
    new ARError(
      'Out of GPU memory',
      'OUT_OF_MEMORY',
      'Reduce camera resolution or quality settings. Close other GPU-intensive applications.',
      undefined
    ),

  UnsupportedFeature: (feature: string) =>
    new ARError(
      `Feature not supported: ${feature}`,
      'UNSUPPORTED_FEATURE',
      'This feature may require a newer browser or hardware capabilities.',
      undefined
    ),
};

/**
 * Diagnose environment and provide recommendations
 */
export async function diagnoseEnvironment(): Promise<{
  webgpu: boolean;
  camera: boolean;
  https: boolean;
  mobile: boolean;
  gpu: string | null;
  recommendations: string[];
}> {
  const recommendations: string[] = [];

  // Check WebGPU
  const webgpu = 'gpu' in navigator;
  if (!webgpu) {
    recommendations.push('❌ WebGPU not supported. Update to Chrome 113+, Edge 113+, or Safari 18+');
  }

  // Check HTTPS (required for camera access)
  const https = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  if (!https) {
    recommendations.push('⚠️  HTTPS required for camera access (or use localhost for development)');
  }

  // Check camera availability
  let camera = false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    camera = devices.some((d) => d.kind === 'videoinput');
    if (!camera) {
      recommendations.push('❌ No camera found. Connect a webcam.');
    }
  } catch {
    recommendations.push('⚠️  Cannot check camera devices (permission may be needed)');
  }

  // Detect mobile
  const mobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile) {
    recommendations.push('📱 Mobile device detected. Consider using "mobile" or "battery-saver" preset.');
  }

  // Get GPU info (if WebGPU available)
  let gpu: string | null = null;
  if (webgpu && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        // requestAdapterInfo is experimental, may not exist
        gpu = 'WebGPU Adapter Available';
      }
    } catch {
      gpu = 'Could not get GPU info';
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Environment is ready for AR!');
  }

  return {
    webgpu,
    camera,
    https,
    mobile,
    gpu,
    recommendations,
  };
}

/**
 * Pretty print environment diagnosis
 */
export async function printDiagnostics(): Promise<void> {
  console.log('%c🔍 AR Environment Diagnostics', 'font-size: 16px; font-weight: bold');
  console.log('━'.repeat(50));

  const diag = await diagnoseEnvironment();

  console.log(`WebGPU Support: ${diag.webgpu ? '✅' : '❌'}`);
  console.log(`Camera Available: ${diag.camera ? '✅' : '❌'}`);
  console.log(`HTTPS: ${diag.https ? '✅' : '⚠️'}`);
  console.log(`GPU: ${diag.gpu || 'Unknown'}`);
  console.log(`Platform: ${diag.mobile ? 'Mobile' : 'Desktop'}`);

  console.log('\n📋 Recommendations:');
  for (const rec of diag.recommendations) {
    console.log(`  ${rec}`);
  }

  console.log('━'.repeat(50));
}

/**
 * Wrap async function with better error handling
 */
export function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorHandler?: (error: ARError) => void
): Promise<T> {
  return fn().catch((error) => {
    let arError: ARError;

    if (error instanceof ARError) {
      arError = error;
    } else if (error.name === 'NotAllowedError') {
      arError = ARErrors.CameraPermissionDenied();
    } else if (error.name === 'NotFoundError') {
      arError = ARErrors.CameraNotFound();
    } else if (error.message?.includes('GPU') || error.message?.includes('WebGPU')) {
      arError = ARErrors.WebGPUNotSupported();
    } else {
      arError = new ARError(error.message || 'Unknown error', 'UNKNOWN_ERROR');
    }

    console.error(arError.getFullMessage());

    if (errorHandler) {
      errorHandler(arError);
    }

    throw arError;
  });
}
