/**
 * XRSessionManager Tests
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { XRSessionManager } from '../../src/core/xr/xr-session-manager';
import type { XRSessionConfig } from '../../src/core/xr/xr-session-manager';

// Mock WebXR APIs
function createMockXRSession(): XRSession {
  const session = {
    mode: 'immersive-ar',
    renderState: {
      baseLayer: null,
    },
    enabledFeatures: ['local', 'hit-test'],
    requestReferenceSpace: mock(async (type: string) => {
      return createMockReferenceSpace();
    }),
    requestHitTestSource: mock(async () => {
      return createMockHitTestSource();
    }),
    requestHitTestSourceForTransientInput: mock(async () => {
      return createMockHitTestSource();
    }),
    requestAnimationFrame: mock((callback: XRFrameRequestCallback) => {
      return 1;
    }),
    cancelAnimationFrame: mock(() => {}),
    end: mock(async () => {}),
    addEventListener: mock(() => {}),
    removeEventListener: mock(() => {}),
  } as unknown as XRSession;

  return session;
}

function createMockReferenceSpace(): XRReferenceSpace {
  return {
    getOffsetReferenceSpace: () => createMockReferenceSpace(),
  } as XRReferenceSpace;
}

function createMockXRFrame(): XRFrame {
  const mockTransform = {
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    matrix: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    inverse: {
      matrix: new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]),
    },
  };

  const mockView = {
    eye: 'left',
    projectionMatrix: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    transform: mockTransform,
  };

  const mockPose = {
    transform: mockTransform,
    views: [mockView],
  };

  return {
    session: createMockXRSession(),
    getViewerPose: mock(() => mockPose),
    getHitTestResults: mock(() => []),
    getHitTestResultsForTransientInput: mock(() => []),
  } as unknown as XRFrame;
}

function createMockHitTestSource(): XRHitTestSource {
  return {
    cancel: mock(() => {}),
  } as unknown as XRHitTestSource;
}

describe('XRSessionManager', () => {
  let manager: XRSessionManager;
  let originalNavigator: typeof navigator;

  beforeEach(() => {
    manager = new XRSessionManager();
    originalNavigator = globalThis.navigator;
  });

  afterEach(() => {
    globalThis.navigator = originalNavigator;
    manager.destroy();
  });

  describe('static methods', () => {
    it('should check WebXR support', async () => {
      // Mock navigator.xr
      const mockXR = {
        isSessionSupported: mock(async () => true),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      const supported = await XRSessionManager.isSupported();
      expect(supported).toBe(true);
    });

    it('should return false when WebXR not available', async () => {
      globalThis.navigator = {
        ...originalNavigator,
        xr: undefined,
      } as typeof navigator;

      const supported = await XRSessionManager.isSupported();
      expect(supported).toBe(false);
    });
  });

  describe('session lifecycle', () => {
    it('should request XR session successfully', async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        isSessionSupported: mock(async () => true),
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      const config: XRSessionConfig = {
        mode: 'immersive-ar',
        requiredFeatures: ['local'],
        optionalFeatures: ['hit-test'],
      };

      await manager.requestSession(config);

      expect(manager.isActive()).toBe(true);
      expect(manager.getSession()).toBe(mockSession);
    });

    it('should not request session if already active', async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();
      expect(manager.isActive()).toBe(true);

      // Try to request again
      await manager.requestSession();

      // Should only be called once
      expect(mockXR.requestSession).toHaveBeenCalledTimes(1);
    });

    it('should end XR session', async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();
      expect(manager.isActive()).toBe(true);

      await manager.endSession();

      expect(mockSession.end).toHaveBeenCalled();
    });

    it('should throw error when WebXR not supported', async () => {
      globalThis.navigator = {
        ...originalNavigator,
        xr: undefined,
      } as typeof navigator;

      await expect(manager.requestSession()).rejects.toThrow('WebXR not supported');
    });

    it('should use default config when none provided', async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();

      expect(manager.isActive()).toBe(true);
    });
  });

  describe('pose data', () => {
    beforeEach(async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();
    });

    it('should get pose data from XR frame', () => {
      const frame = createMockXRFrame();
      const poseData = manager.getPoseData(frame);

      expect(poseData).toBeDefined();
      expect(poseData?.position).toBeDefined();
      expect(poseData?.orientation).toBeDefined();
      expect(poseData?.matrix).toBeDefined();
      expect(poseData?.viewMatrix).toBeDefined();
      expect(poseData?.projectionMatrix).toBeDefined();
    });

    it('should get view data from XR frame', () => {
      const frame = createMockXRFrame();
      const viewData = manager.getViewData(frame);

      expect(viewData).toBeDefined();
      expect(viewData).toBeInstanceOf(Array);
      expect(viewData!.length).toBeGreaterThan(0);

      const view = viewData![0];
      expect(view.eye).toBeDefined();
      expect(view.projectionMatrix).toBeDefined();
      expect(view.viewMatrix).toBeDefined();
      expect(view.viewport).toBeDefined();
    });

    it('should return null for pose data when not active', () => {
      manager.destroy();
      const frame = createMockXRFrame();
      const poseData = manager.getPoseData(frame);

      expect(poseData).toBeNull();
    });
  });

  describe('feature detection', () => {
    beforeEach(async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();
    });

    it('should detect hit test support', () => {
      const supported = manager.supportsHitTest();
      expect(supported).toBe(true);
    });

    it('should detect image tracking support', () => {
      const supported = manager.supportsImageTracking();
      // Will be false as we didn't add it to mock
      expect(supported).toBe(false);
    });

    it('should detect anchors support', () => {
      const supported = manager.supportsAnchors();
      expect(supported).toBe(false);
    });

    it('should detect depth sensing support', () => {
      const supported = manager.supportsDepthSensing();
      expect(supported).toBe(false);
    });

    it('should get list of enabled features', () => {
      const features = manager.getEnabledFeatures();
      expect(features).toBeInstanceOf(Array);
      expect(features).toContain('local');
      expect(features).toContain('hit-test');
    });

    it('should check feature support before session', async () => {
      const newManager = new XRSessionManager();
      const mockXR = {
        isSessionSupported: mock(async () => true),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      const supported = await newManager.isFeatureSupported('hit-test');
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('hit testing', () => {
    beforeEach(async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();
    });

    it('should request hit test source', async () => {
      const source = await manager.requestHitTestSource();
      expect(source).toBeDefined();
    });

    it('should get hit test results from source', () => {
      const frame = createMockXRFrame();
      const source = createMockHitTestSource();
      const results = manager.getHitTestResults(source, frame);

      expect(results).toBeInstanceOf(Array);
    });

    it('should return null when requesting hit test source without support', async () => {
      // Create manager with session that doesn't support hit-test
      const sessionWithoutHitTest = createMockXRSession();
      (sessionWithoutHitTest as any).enabledFeatures = ['local'];

      manager.destroy();
      const mockXR = {
        requestSession: mock(async () => sessionWithoutHitTest),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();

      const source = await manager.requestHitTestSource();
      expect(source).toBeNull();
    });
  });

  describe('getters', () => {
    it('should get null session when not active', () => {
      expect(manager.getSession()).toBeNull();
      expect(manager.getReferenceSpace()).toBeNull();
      expect(manager.getViewerSpace()).toBeNull();
      expect(manager.isActive()).toBe(false);
    });

    it('should get session data when active', async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();

      expect(manager.getSession()).toBe(mockSession);
      expect(manager.getReferenceSpace()).toBeDefined();
      expect(manager.getViewerSpace()).toBeDefined();
      expect(manager.isActive()).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup on destroy', async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();
      expect(manager.isActive()).toBe(true);

      manager.destroy();

      expect(manager.isActive()).toBe(false);
      expect(manager.getSession()).toBeNull();
      expect(manager.getEnabledFeatures()).toHaveLength(0);
    });

    it('should cancel hit test source on cleanup', async () => {
      const mockSession = createMockXRSession();
      const mockXR = {
        requestSession: mock(async () => mockSession),
      } as unknown as XRSystem;

      globalThis.navigator = {
        ...originalNavigator,
        xr: mockXR,
      } as typeof navigator;

      await manager.requestSession();
      const source = await manager.requestHitTestSource();

      manager.destroy();

      if (source) {
        expect(source.cancel).toHaveBeenCalled();
      }
    });
  });
});
