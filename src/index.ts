/**
 * BabylonJS AR Library
 * High-performance WebGPU AR with marker tracking and plane detection
 */

// Core exports
export { AREngine, type AREngineConfig, type ARFrame } from './core/engine';
export { GPUContextManager, type GPUContextConfig } from './core/gpu/gpu-context';
export {
  ComputePipeline,
  type ComputePipelineConfig,
  type BindGroupEntry,
  calculateWorkgroupCount,
  alignBufferSize,
} from './core/gpu/compute-pipeline';
export { CameraManager, type CameraConfig, type CameraFrame } from './core/camera/camera-manager';

// Math utilities
export { Matrix4 } from './core/math/matrix';
export { Vector3 } from './core/math/vector';
export { Quaternion } from './core/math/quaternion';

// Version
export const VERSION = '0.1.0';
