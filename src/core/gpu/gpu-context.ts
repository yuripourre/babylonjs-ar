/**
 * GPU Context Manager
 * WebGPU-first GPU context management
 */

import { ARError, ARErrors } from '../errors';
import { Logger } from '../../utils/logger';

const log = Logger.create('GPUContextManager');

export interface GPUContextConfig {
  powerPreference?: 'low-power' | 'high-performance';
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Record<string, number>;
}

export class GPUContextManager {
  private _device: GPUDevice | null = null;
  private _adapter: GPUAdapter | null = null;
  private isInitialized = false;

  /**
   * Initialize GPU context (WebGPU only)
   */
  async initialize(config: GPUContextConfig = {}): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Check WebGPU support
    if (!navigator.gpu) {
      throw ARErrors.webGPUUnavailable();
    }

    log.info('Requesting WebGPU adapter...');

    // Request adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: config.powerPreference ?? 'high-performance',
    });

    if (!adapter) {
      throw new ARError(
        'Failed to get WebGPU adapter',
        'WEBGPU_ADAPTER_FAILED',
        {
          suggestions: [
            {
              message: 'Your GPU might not support WebGPU',
            },
            {
              message: 'Try updating your graphics drivers',
            },
          ],
        }
      );
    }

    this._adapter = adapter as unknown as GPUAdapter;

    log.info('WebGPU adapter acquired', {
      vendor: (adapter as any).info?.vendor,
      architecture: (adapter as any).info?.architecture,
    });

    // Request device
    const device = await adapter.requestDevice({
      requiredFeatures: config.requiredFeatures,
      requiredLimits: config.requiredLimits,
    });

    this._device = device as unknown as GPUDevice;

    if (!this._device) {
      throw new ARError(
        'Failed to get WebGPU device',
        'WEBGPU_DEVICE_FAILED'
      );
    }

    // Handle device lost
    this._device.lost.then((info) => {
      log.error('WebGPU device lost:', info.message);
    });

    // Handle uncaptured errors
    this._device.addEventListener('uncapturederror', (event) => {
      log.error('Uncaptured WebGPU error:', event.error);
    });

    this.isInitialized = true;

    log.info('GPU context initialized successfully');
  }

  /**
   * Get WebGPU device
   */
  get device(): GPUDevice {
    if (!this._device) {
      throw new ARError(
        'GPU context not initialized',
        'NOT_INITIALIZED'
      );
    }
    return this._device;
  }

  /**
   * Get WebGPU adapter
   */
  get adapter(): GPUAdapter {
    if (!this._adapter) {
      throw new ARError(
        'GPU context not initialized',
        'NOT_INITIALIZED'
      );
    }
    return this._adapter;
  }

  /**
   * Import video frame as external texture
   */
  async importVideoFrame(
    frame: VideoFrame | HTMLVideoElement
  ): Promise<GPUExternalTexture> {
    const device = this.device;

    if ('importExternalTexture' in device) {
      return device.importExternalTexture({ source: frame as any });
    }

    throw new ARError(
      'importExternalTexture not supported',
      'INITIALIZATION_FAILED'
    );
  }

  /**
   * Check if initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Destroy context
   */
  destroy(): void {
    if (this._device) {
      this._device.destroy();
      this._device = null;
    }

    this._adapter = null;
    this.isInitialized = false;

    log.info('GPU context destroyed');
  }
}
