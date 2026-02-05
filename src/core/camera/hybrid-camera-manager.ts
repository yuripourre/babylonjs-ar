/**
 * Hybrid Camera Manager
 * Composes camera frames from MediaStream OR XR camera with unified interface
 *
 * Features:
 * - Seamless switching between MediaStream and XR camera
 * - Unified CameraFrame interface
 * - XR view access for rendering
 * - Automatic fallback to MediaStream if XR unavailable
 */

import { CameraManager, type CameraConfig, type CameraFrame } from './camera-manager';
import { XRSessionManager } from '../xr/xr-session-manager';
import { Logger } from '../../utils/logger';

const log = Logger.create('HybridCameraManager');

export interface HybridCameraConfig extends CameraConfig {
  preferXRCamera?: boolean; // Prefer XR camera over MediaStream if available
  xrSession?: XRSessionManager; // Optional XR session for camera
}

export class HybridCameraManager extends CameraManager {
  private xrSession: XRSessionManager | null = null;
  private useXRCamera = false;
  private currentXRFrame: XRFrame | null = null;
  private xrFrameCallback: XRFrameRequestCallback | null = null;
  private xrAnimationFrameHandle: number | null = null;

  /**
   * Initialize hybrid camera with optional XR support
   */
  async initialize(config: HybridCameraConfig = {}): Promise<void> {
    const preferXR = config.preferXRCamera ?? true;

    // Try to use XR camera if available and preferred
    if (preferXR && config.xrSession && config.xrSession.isActive()) {
      this.xrSession = config.xrSession;
      this.useXRCamera = true;
      log.info('Using XR camera');
      return;
    }

    // Fall back to MediaStream
    await super.initialize(config);
    this.useXRCamera = false;
    log.info('Using MediaStream camera');
  }

  /**
   * Get current camera frame
   * Returns frame from XR camera or MediaStream depending on mode
   */
  getCurrentFrame(): CameraFrame | null {
    if (this.useXRCamera) {
      return this.getXRCameraFrame();
    }

    return super.getCurrentFrame();
  }

  /**
   * Get camera frame from XR session
   * Note: This requires being called from within XR RAF callback
   */
  private getXRCameraFrame(): CameraFrame | null {
    if (!this.xrSession || !this.currentXRFrame) {
      return null;
    }

    try {
      const session = this.xrSession.getSession();
      if (!session) {
        return null;
      }

      // Get XR camera feed
      // Note: XR camera access varies by implementation
      // Some platforms provide camera texture, others require rendering
      const viewData = this.xrSession.getViewData(this.currentXRFrame);
      if (!viewData || viewData.length === 0) {
        return null;
      }

      const view = viewData[0];

      // XR frames don't provide VideoFrame directly
      // The rendering is done through XR layer
      // For processing, we need to capture from XR layer or use a fallback
      // For now, return null to indicate XR camera requires different processing path

      return null;
    } catch (error) {
      log.error('Failed to get XR camera frame', error);
      return null;
    }
  }

  /**
   * Get XR view for current frame
   * Used for rendering in XR mode
   */
  getXRView(frame: XRFrame): XRView | null {
    if (!this.useXRCamera || !this.xrSession) {
      return null;
    }

    try {
      const viewData = this.xrSession.getViewData(frame);
      if (!viewData || viewData.length === 0) {
        return null;
      }

      // Return first view (or handle stereo later)
      const referenceSpace = this.xrSession.getReferenceSpace();
      if (!referenceSpace) {
        return null;
      }

      const pose = frame.getViewerPose(referenceSpace);
      if (!pose) {
        return null;
      }

      return pose.views[0];
    } catch (error) {
      log.error('Failed to get XR view', error);
      return null;
    }
  }

  /**
   * Check if using XR camera
   */
  isUsingXRCamera(): boolean {
    return this.useXRCamera;
  }

  /**
   * Get XR session
   */
  getXRSession(): XRSessionManager | null {
    return this.xrSession;
  }

  /**
   * Set XR session and switch to XR camera
   */
  setXRSession(session: XRSessionManager): void {
    if (!session.isActive()) {
      log.warn('Cannot set inactive XR session');
      return;
    }

    this.xrSession = session;
    this.useXRCamera = true;
    log.info('Switched to XR camera');
  }

  /**
   * Switch back to MediaStream camera
   */
  async switchToMediaStream(config?: CameraConfig): Promise<void> {
    if (!this.useXRCamera) {
      return;
    }

    await super.initialize(config ?? {});
    this.useXRCamera = false;
    log.info('Switched to MediaStream camera');
  }

  /**
   * Update current XR frame (called from XR RAF callback)
   */
  updateXRFrame(frame: XRFrame): void {
    this.currentXRFrame = frame;
  }

  /**
   * Start XR animation loop
   */
  startXRLoop(callback: (frame: XRFrame, timestamp: number) => void): void {
    if (!this.xrSession || !this.useXRCamera) {
      log.error('Cannot start XR loop: not using XR camera');
      return;
    }

    const session = this.xrSession.getSession();
    if (!session) {
      log.error('Cannot start XR loop: no active session');
      return;
    }

    this.xrFrameCallback = (timestamp: DOMHighResTimeStamp, frame: XRFrame) => {
      this.updateXRFrame(frame);
      callback(frame, timestamp);

      // Continue loop
      if (this.xrSession?.isActive()) {
        this.xrAnimationFrameHandle = session.requestAnimationFrame(
          this.xrFrameCallback!
        );
      }
    };

    this.xrAnimationFrameHandle = session.requestAnimationFrame(
      this.xrFrameCallback
    );
    log.info('XR animation loop started');
  }

  /**
   * Stop XR animation loop
   */
  stopXRLoop(): void {
    if (this.xrAnimationFrameHandle !== null && this.xrSession) {
      const session = this.xrSession.getSession();
      if (session) {
        session.cancelAnimationFrame(this.xrAnimationFrameHandle);
        this.xrAnimationFrameHandle = null;
        log.info('XR animation loop stopped');
      }
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopXRLoop();
    super.destroy();

    this.xrSession = null;
    this.currentXRFrame = null;
    this.useXRCamera = false;
  }
}
