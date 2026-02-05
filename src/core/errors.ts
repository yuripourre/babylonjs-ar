/**
 * Unified Error Handling System
 * Provides consistent error reporting with codes, context, and recovery hints
 */

/**
 * Standard error codes for the AR system
 */
export const ErrorCodes = {
  // WebGPU/Browser Support
  WEBGPU_UNAVAILABLE: 'WEBGPU_UNAVAILABLE',
  WEBGPU_ADAPTER_FAILED: 'WEBGPU_ADAPTER_FAILED',
  WEBGPU_DEVICE_FAILED: 'WEBGPU_DEVICE_FAILED',

  // Camera
  CAMERA_PERMISSION_DENIED: 'CAMERA_PERMISSION_DENIED',
  CAMERA_NOT_FOUND: 'CAMERA_NOT_FOUND',
  CAMERA_ALREADY_IN_USE: 'CAMERA_ALREADY_IN_USE',
  CAMERA_INITIALIZATION_FAILED: 'CAMERA_INITIALIZATION_FAILED',

  // Resources
  SHADER_COMPILATION_FAILED: 'SHADER_COMPILATION_FAILED',
  SHADER_NOT_FOUND: 'SHADER_NOT_FOUND',
  BUFFER_CREATION_FAILED: 'BUFFER_CREATION_FAILED',
  TEXTURE_CREATION_FAILED: 'TEXTURE_CREATION_FAILED',

  // Models
  MODEL_LOAD_FAILED: 'MODEL_LOAD_FAILED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  MODEL_INFERENCE_FAILED: 'MODEL_INFERENCE_FAILED',

  // Tracking
  TRACKING_LOST: 'TRACKING_LOST',
  MARKER_DETECTION_FAILED: 'MARKER_DETECTION_FAILED',
  POSE_ESTIMATION_FAILED: 'POSE_ESTIMATION_FAILED',

  // XR
  XR_NOT_SUPPORTED: 'XR_NOT_SUPPORTED',
  XR_SESSION_FAILED: 'XR_SESSION_FAILED',
  XR_FEATURE_NOT_AVAILABLE: 'XR_FEATURE_NOT_AVAILABLE',

  // Plugin System
  PLUGIN_ALREADY_REGISTERED: 'PLUGIN_ALREADY_REGISTERED',
  PLUGIN_INITIALIZATION_FAILED: 'PLUGIN_INITIALIZATION_FAILED',
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',

  // General
  INITIALIZATION_FAILED: 'INITIALIZATION_FAILED',
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  INVALID_STATE: 'INVALID_STATE',
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  ALREADY_INITIALIZED: 'ALREADY_INITIALIZED',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Structured error context
 */
export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * Recovery suggestion
 */
export interface RecoverySuggestion {
  message: string;
  action?: string;
  link?: string;
}

/**
 * AR Error class with structured information
 */
export class ARError extends Error {
  /**
   * Error code for programmatic handling
   */
  public readonly code: ErrorCode;

  /**
   * Whether this error is recoverable
   */
  public readonly recoverable: boolean;

  /**
   * Additional context about the error
   */
  public readonly context?: ErrorContext;

  /**
   * Suggestions for recovery
   */
  public readonly suggestions: RecoverySuggestion[];

  /**
   * Original error if this is wrapping another error
   */
  public readonly cause?: Error;

  constructor(
    message: string,
    code: ErrorCode,
    options: {
      recoverable?: boolean;
      context?: ErrorContext;
      suggestions?: RecoverySuggestion[];
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'ARError';
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.context = options.context;
    this.suggestions = options.suggestions ?? [];
    this.cause = options.cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ARError);
    }
  }

  /**
   * Convert to JSON for logging/telemetry
   */
  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      context: this.context,
      suggestions: this.suggestions,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }

  /**
   * Format error for user display
   */
  toUserMessage(): string {
    let msg = this.message;

    if (this.suggestions.length > 0) {
      msg += '\n\nSuggestions:';
      for (const suggestion of this.suggestions) {
        msg += `\n• ${suggestion.message}`;
        if (suggestion.link) {
          msg += ` (${suggestion.link})`;
        }
      }
    }

    return msg;
  }
}

/**
 * Factory functions for common errors
 */
export const ARErrors = {
  webGPUUnavailable(): ARError {
    return new ARError(
      'WebGPU is not supported in this browser',
      ErrorCodes.WEBGPU_UNAVAILABLE,
      {
        recoverable: false,
        context: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          hasGPU: typeof navigator !== 'undefined' && 'gpu' in navigator,
        },
        suggestions: [
          {
            message: 'Use Chrome 113+ or Edge 113+',
            link: 'https://caniuse.com/webgpu',
          },
          {
            message: 'Enable WebGPU flag in browser settings',
            action: 'chrome://flags/#enable-unsafe-webgpu',
          },
        ],
      }
    );
  },

  cameraPermissionDenied(): ARError {
    return new ARError(
      'Camera permission was denied',
      ErrorCodes.CAMERA_PERMISSION_DENIED,
      {
        recoverable: true,
        suggestions: [
          {
            message: 'Grant camera permission in browser settings',
            action: 'browser-settings',
          },
          {
            message: 'Reload the page after granting permission',
          },
        ],
      }
    );
  },

  modelLoadFailed(modelName: string, cause?: Error): ARError {
    return new ARError(
      `Failed to load model: ${modelName}`,
      ErrorCodes.MODEL_LOAD_FAILED,
      {
        recoverable: true,
        context: { modelName },
        cause,
        suggestions: [
          {
            message: 'Check your internet connection',
          },
          {
            message: 'Verify model URL is accessible',
          },
        ],
      }
    );
  },

  pluginInitializationFailed(pluginName: string, cause?: Error): ARError {
    return new ARError(
      `Plugin initialization failed: ${pluginName}`,
      ErrorCodes.PLUGIN_INITIALIZATION_FAILED,
      {
        recoverable: false,
        context: { pluginName },
        cause,
        suggestions: [
          {
            message: 'Check plugin configuration',
          },
          {
            message: 'Verify all dependencies are initialized',
          },
        ],
      }
    );
  },

  invalidConfiguration(field: string, reason: string): ARError {
    return new ARError(
      `Invalid configuration: ${field} - ${reason}`,
      ErrorCodes.INVALID_CONFIGURATION,
      {
        recoverable: false,
        context: { field, reason },
        suggestions: [
          {
            message: 'Check configuration documentation',
          },
        ],
      }
    );
  },

  notInitialized(component: string): ARError {
    return new ARError(
      `${component} is not initialized`,
      ErrorCodes.NOT_INITIALIZED,
      {
        recoverable: false,
        context: { component },
        suggestions: [
          {
            message: `Call ${component}.initialize() before using`,
          },
        ],
      }
    );
  },
};

/**
 * Error handler utility
 */
export class ErrorHandler {
  private handlers = new Map<ErrorCode, (error: ARError) => void>();

  /**
   * Register handler for specific error code
   */
  on(code: ErrorCode, handler: (error: ARError) => void): void {
    this.handlers.set(code, handler);
  }

  /**
   * Handle error with registered handlers
   */
  handle(error: unknown): void {
    if (error instanceof ARError) {
      const handler = this.handlers.get(error.code);
      if (handler) {
        handler(error);
      } else {
        this.defaultHandler(error);
      }
    } else if (error instanceof Error) {
      this.defaultHandler(new ARError(
        error.message,
        ErrorCodes.INITIALIZATION_FAILED,
        { cause: error }
      ));
    } else {
      this.defaultHandler(new ARError(
        String(error),
        ErrorCodes.INITIALIZATION_FAILED
      ));
    }
  }

  private defaultHandler(error: ARError): void {
    console.error('[ARError]', error.toJSON());

    if (error.recoverable) {
      console.info('[ARError] This error is recoverable. See suggestions above.');
    }
  }
}

/**
 * Async error boundary wrapper
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorHandler?: (error: ARError) => void
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const arError = error instanceof ARError
      ? error
      : new ARError(
          error instanceof Error ? error.message : String(error),
          ErrorCodes.INITIALIZATION_FAILED,
          { cause: error instanceof Error ? error : undefined }
        );

    if (errorHandler) {
      errorHandler(arError);
    } else {
      console.error('[ARError]', arError.toJSON());
    }

    return null;
  }
}
