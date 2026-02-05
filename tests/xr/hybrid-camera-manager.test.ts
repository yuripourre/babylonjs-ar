/**
 * HybridCameraManager Tests
 * Focuses on XR-specific functionality
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { HybridCameraManager } from '../../src/core/camera/hybrid-camera-manager';
import { XRSessionManager } from '../../src/core/xr/xr-session-manager';
import type { HybridCameraConfig } from '../../src/core/camera/hybrid-camera-manager';

// Mock XR Session
function createMockXRSessionManager(active: boolean = true): XRSessionManager {
  const mockSession = {
    mode: 'immersive-ar',
    renderState: { baseLayer: null },
    requestReferenceSpace: mock(async () => ({} as XRReferenceSpace)),
    requestAnimationFrame: mock((callback: XRFrameRequestCallback) => 1),
    cancelAnimationFrame: mock(() => {}),
    end: mock(async () => {}),
    addEventListener: mock(() => {}),
  } as unknown as XRSession;

  const mockTransform = {
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    matrix: new Float32Array(16).fill(0),
    inverse: { matrix: new Float32Array(16).fill(0) },
  };

  const mockView = {
    eye: 'left',
    projectionMatrix: new Float32Array(16),
    transform: mockTransform,
  };

  const mockPose = {
    transform: mockTransform,
    views: [mockView],
  };

  const manager = {
    isActive: mock(() => active),
    getSession: mock(() => (active ? mockSession : null)),
    getReferenceSpace: mock(() => ({} as XRReferenceSpace)),
    getViewData: mock(() => [
      {
        eye: 'left' as const,
        projectionMatrix: { data: new Float32Array(16) },
        viewMatrix: { data: new Float32Array(16) },
        viewport: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
  } as unknown as XRSessionManager;

  return manager;
}

describe('HybridCameraManager', () => {
  let manager: HybridCameraManager;

  beforeEach(() => {
    manager = new HybridCameraManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('XR camera initialization', () => {
    it('should prefer XR camera when available', async () => {
      const mockXRSession = createMockXRSessionManager(true);

      const config: HybridCameraConfig = {
        preferXRCamera: true,
        xrSession: mockXRSession,
      };

      await manager.initialize(config);

      expect(manager.isUsingXRCamera()).toBe(true);
    });

    it('should detect inactive XR session', async () => {
      const mockXRSession = createMockXRSessionManager(false);

      const config: HybridCameraConfig = {
        preferXRCamera: true,
        xrSession: mockXRSession,
      };

      // When XR session is inactive, fallback to MediaStream (which will fail in test env)
      // But we test that XR camera is NOT used
      await expect(manager.initialize(config)).rejects.toThrow();
      expect(manager.isUsingXRCamera()).toBe(false);
    });
  });

  describe('XR view access', () => {
    beforeEach(async () => {
      const mockXRSession = createMockXRSessionManager(true);
      await manager.initialize({
        preferXRCamera: true,
        xrSession: mockXRSession,
      });
    });

    it('should return XR view when using XR camera', () => {
      const mockTransform = {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        matrix: new Float32Array(16),
        inverse: { matrix: new Float32Array(16) },
      };

      const mockView = {
        eye: 'left',
        projectionMatrix: new Float32Array(16),
        transform: mockTransform,
      };

      const mockPose = {
        transform: mockTransform,
        views: [mockView],
      };

      const mockFrame = {
        session: {} as XRSession,
        getViewerPose: mock(() => mockPose),
      } as unknown as XRFrame;

      const view = manager.getXRView(mockFrame);

      expect(view).toBeDefined();
      expect(view?.eye).toBe('left');
    });

    it('should return null frame from XR camera initially', () => {
      const frame = manager.getCurrentFrame();
      // XR camera returns null until XRFrame is provided
      expect(frame).toBeNull();
    });
  });

  describe('mode checking', () => {
    it('should correctly report XR camera usage', async () => {
      const mockXRSession = createMockXRSessionManager(true);

      expect(manager.isUsingXRCamera()).toBe(false);

      await manager.initialize({
        preferXRCamera: true,
        xrSession: mockXRSession,
      });

      expect(manager.isUsingXRCamera()).toBe(true);
    });

    it('should get XR session when using XR camera', async () => {
      const mockXRSession = createMockXRSessionManager(true);

      await manager.initialize({
        preferXRCamera: true,
        xrSession: mockXRSession,
      });

      const session = manager.getXRSession();
      expect(session).toBe(mockXRSession);
    });

    it('should return null XR session initially', () => {
      const session = manager.getXRSession();
      expect(session).toBeNull();
    });
  });

  describe('switching modes', () => {
    it('should switch to XR session from null state', () => {
      expect(manager.isUsingXRCamera()).toBe(false);

      const mockXRSession = createMockXRSessionManager(true);
      manager.setXRSession(mockXRSession);

      expect(manager.isUsingXRCamera()).toBe(true);
    });

    it('should not switch to inactive XR session', () => {
      const mockXRSession = createMockXRSessionManager(false);
      manager.setXRSession(mockXRSession);

      // Should remain not using XR
      expect(manager.isUsingXRCamera()).toBe(false);
    });
  });

  describe('XR loop management', () => {
    beforeEach(async () => {
      const mockXRSession = createMockXRSessionManager(true);
      await manager.initialize({
        preferXRCamera: true,
        xrSession: mockXRSession,
      });
    });

    it('should start XR animation loop', () => {
      const callback = mock(() => {});
      manager.startXRLoop(callback);

      const session = manager.getXRSession()?.getSession();
      expect(session?.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should update XR frame', () => {
      const mockFrame = {} as XRFrame;
      manager.updateXRFrame(mockFrame);

      // Should not throw
      expect(manager.isUsingXRCamera()).toBe(true);
    });

    it('should stop XR animation loop', () => {
      const callback = mock(() => {});
      manager.startXRLoop(callback);
      manager.stopXRLoop();

      const session = manager.getXRSession()?.getSession();
      expect(session?.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should safely stop XR loop when not started', () => {
      // Stop without starting
      manager.stopXRLoop();

      // Should not throw
      expect(manager.isUsingXRCamera()).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should destroy and cleanup resources', async () => {
      const mockXRSession = createMockXRSessionManager(true);

      await manager.initialize({
        preferXRCamera: true,
        xrSession: mockXRSession,
      });

      const callback = mock(() => {});
      manager.startXRLoop(callback);

      manager.destroy();

      // Should stop XR loop
      const session = mockXRSession.getSession();
      expect(session?.cancelAnimationFrame).toHaveBeenCalled();

      // Should not be using XR camera after destroy
      expect(manager.isUsingXRCamera()).toBe(false);
      expect(manager.getXRSession()).toBeNull();
    });

    it('should safely destroy without initialization', () => {
      // Should not throw
      manager.destroy();
      expect(manager.isUsingXRCamera()).toBe(false);
    });
  });
});
