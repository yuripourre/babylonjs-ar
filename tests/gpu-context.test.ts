import { test, expect, describe } from 'bun:test';
import { GPUContextManager } from '../src/core/gpu/gpu-context';

describe('GPUContextManager', () => {
  test('should have GPU context manager class', () => {
    expect(GPUContextManager).toBeDefined();
  });

  test('creates instance', () => {
    const manager = new GPUContextManager();
    expect(manager).toBeDefined();
  });

  test('isReady returns false before initialization', () => {
    const manager = new GPUContextManager();
    expect(manager.isReady()).toBe(false);
  });

  // Note: Full GPU tests require a browser environment with WebGPU
  // Hardware-specific tests should be run in browser
});
