/**
 * XR Session Manager
 * Manages WebXR session lifecycle, provides unified pose data, and feature access
 *
 * Features:
 * - Immersive AR session management
 * - XR pose data extraction
 * - Hit test integration
 * - Feature detection (hit-test, image-tracking, anchors)
 * - Reference space management
 */

import { Matrix4 } from '../math/matrix';
import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import { Logger } from '../../utils/logger';

const log = Logger.create('XRSessionManager');

export interface XRSessionConfig {
  mode?: XRSessionMode;
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: HTMLElement;
}

export interface XRPoseData {
  position: Vector3;
  orientation: Quaternion;
  matrix: Matrix4;
  viewMatrix: Matrix4;
  projectionMatrix: Matrix4;
}

export interface XRViewData {
  eye: 'left' | 'right' | 'none';
  projectionMatrix: Matrix4;
  viewMatrix: Matrix4;
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class XRSessionManager {
  private xrSession: XRSession | null = null;
  private xrReferenceSpace: XRReferenceSpace | null = null;
  private xrViewerSpace: XRReferenceSpace | null = null;
  private xrHitTestSource: XRHitTestSource | null = null;
  private isSessionActive = false;
  private sessionConfig: XRSessionConfig | null = null;

  // Feature support cache
  private supportedFeatures: Set<string> = new Set();

  constructor() {}

  /**
   * Check if WebXR is supported in this browser
   */
  static async isSupported(): Promise<boolean> {
    if (!navigator.xr) {
      return false;
    }

    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch (error) {
      log.error('Failed to check WebXR support', error);
      return false;
    }
  }

  /**
   * Check if a specific feature is supported
   */
  async isFeatureSupported(feature: string): Promise<boolean> {
    if (!navigator.xr) {
      return false;
    }

    try {
      // Try to query session with the feature
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      if (!supported) {
        return false;
      }

      // Feature detection is limited - we'll try during session creation
      return true;
    } catch (error) {
      log.warn(`Failed to check feature support: ${feature}`, error);
      return false;
    }
  }

  /**
   * Request an XR session
   */
  async requestSession(config: XRSessionConfig = {}): Promise<void> {
    if (this.isSessionActive) {
      log.warn('XR session already active');
      return;
    }

    if (!navigator.xr) {
      throw new Error('WebXR not supported in this browser');
    }

    this.sessionConfig = {
      mode: config.mode ?? 'immersive-ar',
      requiredFeatures: config.requiredFeatures ?? ['local'],
      optionalFeatures: config.optionalFeatures ?? ['hit-test', 'dom-overlay'],
      domOverlay: config.domOverlay,
    };

    const sessionInit: XRSessionInit = {
      requiredFeatures: this.sessionConfig.requiredFeatures,
      optionalFeatures: this.sessionConfig.optionalFeatures,
    };

    if (this.sessionConfig.domOverlay) {
      sessionInit.domOverlay = { root: this.sessionConfig.domOverlay };
    }

    try {
      log.info(`Requesting XR session: ${this.sessionConfig.mode}`);
      this.xrSession = await navigator.xr.requestSession(
        this.sessionConfig.mode!,
        sessionInit
      );

      // Set up session event handlers
      this.xrSession.addEventListener('end', this.onSessionEnd);

      // Get reference spaces
      this.xrReferenceSpace = await this.xrSession.requestReferenceSpace('local');
      this.xrViewerSpace = await this.xrSession.requestReferenceSpace('viewer');

      // Detect enabled features
      this.detectEnabledFeatures();

      this.isSessionActive = true;
      log.info('XR session started successfully');
    } catch (error) {
      log.error('Failed to start XR session', error);
      throw new Error(`Failed to start XR session: ${error}`);
    }
  }

  /**
   * End the current XR session
   */
  async endSession(): Promise<void> {
    if (!this.xrSession) {
      return;
    }

    try {
      await this.xrSession.end();
    } catch (error) {
      log.error('Failed to end XR session', error);
    }
  }

  /**
   * Handle session end event
   */
  private onSessionEnd = (): void => {
    log.info('XR session ended');
    this.cleanup();
  };

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.xrHitTestSource) {
      this.xrHitTestSource.cancel();
      this.xrHitTestSource = null;
    }

    this.xrSession = null;
    this.xrReferenceSpace = null;
    this.xrViewerSpace = null;
    this.isSessionActive = false;
    this.supportedFeatures.clear();
  }

  /**
   * Detect enabled features from the session
   */
  private detectEnabledFeatures(): void {
    if (!this.xrSession) {
      return;
    }

    // Check enabled features from session
    const enabledFeatures = (this.xrSession as any).enabledFeatures;
    if (enabledFeatures) {
      for (const feature of enabledFeatures) {
        this.supportedFeatures.add(feature);
        log.debug(`XR feature enabled: ${feature}`);
      }
    }
  }

  /**
   * Get XR frame for current animation frame
   */
  getXRFrame(timestamp: number): XRFrame | null {
    // XRFrame is only available within the XR RAF callback
    // This method is called from within that callback
    return null; // Frame is passed to update method instead
  }

  /**
   * Get pose data from XR frame
   */
  getPoseData(frame: XRFrame): XRPoseData | null {
    if (!this.xrReferenceSpace || !this.xrSession) {
      return null;
    }

    try {
      const pose = frame.getViewerPose(this.xrReferenceSpace);
      if (!pose) {
        return null;
      }

      const transform = pose.transform;
      const position = transform.position;
      const orientation = transform.orientation;

      // Convert XR pose to our format
      const pos = new Vector3(position.x, position.y, position.z);
      const quat = new Quaternion(
        orientation.x,
        orientation.y,
        orientation.z,
        orientation.w
      );

      // Build transformation matrix
      const matrix = Matrix4.compose(pos, quat, new Vector3(1, 1, 1));

      // Get view matrix (inverse of transform)
      const viewMatrix = matrix.inverse();

      // Get projection matrix from first view
      const view = pose.views[0];
      const projectionMatrix = new Matrix4(view.projectionMatrix);

      return {
        position: pos,
        orientation: quat,
        matrix,
        viewMatrix,
        projectionMatrix,
      };
    } catch (error) {
      log.error('Failed to get pose data', error);
      return null;
    }
  }

  /**
   * Get view data for rendering
   */
  getViewData(frame: XRFrame): XRViewData[] | null {
    if (!this.xrReferenceSpace || !this.xrSession) {
      return null;
    }

    try {
      const pose = frame.getViewerPose(this.xrReferenceSpace);
      if (!pose) {
        return null;
      }

      const viewDataArray: XRViewData[] = [];

      // Get the base layer to access viewports
      const session = frame.session;
      const layer = session.renderState.baseLayer;

      for (const view of pose.views) {
        const projectionMatrix = new Matrix4(view.projectionMatrix);
        const viewMatrix = new Matrix4(view.transform.inverse.matrix);

        let eye: 'left' | 'right' | 'none' = 'none';
        if (view.eye === 'left') {eye = 'left';}
        else if (view.eye === 'right') {eye = 'right';}

        // Get viewport from layer if available
        const viewport = layer?.getViewport(view);

        viewDataArray.push({
          eye,
          projectionMatrix,
          viewMatrix,
          viewport: viewport ? {
            x: viewport.x,
            y: viewport.y,
            width: viewport.width,
            height: viewport.height,
          } : {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          },
        });
      }

      return viewDataArray;
    } catch (error) {
      log.error('Failed to get view data', error);
      return null;
    }
  }

  /**
   * Check if hit testing is supported
   */
  supportsHitTest(): boolean {
    return this.supportedFeatures.has('hit-test');
  }

  /**
   * Check if image tracking is supported
   */
  supportsImageTracking(): boolean {
    return this.supportedFeatures.has('image-tracking');
  }

  /**
   * Check if anchors are supported
   */
  supportsAnchors(): boolean {
    return this.supportedFeatures.has('anchors');
  }

  /**
   * Check if depth sensing is supported
   */
  supportsDepthSensing(): boolean {
    return this.supportedFeatures.has('depth-sensing');
  }

  /**
   * Request hit test source for screen-space ray casting
   */
  async requestHitTestSource(
    options?: XRHitTestOptionsInit
  ): Promise<XRHitTestSource | null> {
    if (!this.xrSession) {
      log.error('Cannot request hit test source: no active session');
      return null;
    }

    if (!this.supportsHitTest()) {
      log.warn('Hit testing not supported in this session');
      return null;
    }

    try {
      // Create default XRRay if XRRay is available
      const defaultRay = typeof XRRay !== 'undefined' ? new XRRay() : undefined;

      const hitTestOptions: XRHitTestOptionsInit = options ?? {
        space: this.xrViewerSpace!,
        offsetRay: defaultRay,
      } as XRHitTestOptionsInit;

      this.xrHitTestSource = await this.xrSession.requestHitTestSource?.(
        hitTestOptions
      ) ?? null;

      if (!this.xrHitTestSource) {
        log.warn('Hit test source could not be created');
        return null;
      }

      log.info('Hit test source created');
      return this.xrHitTestSource;
    } catch (error) {
      log.error('Failed to request hit test source', error);
      return null;
    }
  }

  /**
   * Get hit test results from a hit test source
   */
  getHitTestResults(
    source: XRHitTestSource,
    frame: XRFrame
  ): XRHitTestResult[] {
    try {
      return frame.getHitTestResults(source);
    } catch (error) {
      log.error('Failed to get hit test results', error);
      return [];
    }
  }

  /**
   * Get hit test results for a specific ray
   */
  async getHitTestResultsForRay(
    frame: XRFrame,
    ray: XRRay
  ): Promise<XRHitTestResult[]> {
    if (!this.xrSession || !this.xrReferenceSpace) {
      return [];
    }

    try {
      // Check if transient hit test is supported
      if (typeof this.xrSession.requestHitTestSourceForTransientInput !== 'function') {
        log.warn('Transient hit test not supported');
        return [];
      }

      // Use transient hit test for one-off queries
      const source = await this.xrSession.requestHitTestSourceForTransientInput({
        profile: 'generic-touchscreen',
      });

      const results = frame.getHitTestResultsForTransientInput(source);
      source.cancel();

      // Flatten results from all input sources
      const allResults: XRHitTestResult[] = [];
      for (const inputResults of results) {
        allResults.push(...inputResults.results);
      }

      return allResults;
    } catch (error) {
      log.error('Failed to get hit test results for ray', error);
      return [];
    }
  }

  /**
   * Get the current XR session
   */
  getSession(): XRSession | null {
    return this.xrSession;
  }

  /**
   * Get the reference space
   */
  getReferenceSpace(): XRReferenceSpace | null {
    return this.xrReferenceSpace;
  }

  /**
   * Get the viewer space
   */
  getViewerSpace(): XRReferenceSpace | null {
    return this.xrViewerSpace;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.isSessionActive;
  }

  /**
   * Get list of enabled features
   */
  getEnabledFeatures(): string[] {
    return Array.from(this.supportedFeatures);
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    if (this.isSessionActive) {
      this.endSession();
    }
    this.cleanup();
  }
}
