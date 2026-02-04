/**
 * Camera Manager
 * Handles MediaStream acquisition and VideoFrame management for AR
 */

export interface CameraConfig {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
  frameRate?: number;
}

export interface CameraFrame {
  videoFrame: VideoFrame;
  timestamp: number;
  width: number;
  height: number;
}

export class CameraManager {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private isStreaming = false;
  private currentConfig: CameraConfig = {};

  /**
   * Initialize camera with specified configuration
   */
  async initialize(config: CameraConfig = {}): Promise<void> {
    this.currentConfig = {
      width: config.width ?? 1280,
      height: config.height ?? 720,
      facingMode: config.facingMode ?? 'environment',
      frameRate: config.frameRate ?? 60,
    };

    // Request camera access
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: this.currentConfig.width },
        height: { ideal: this.currentConfig.height },
        facingMode: this.currentConfig.facingMode,
        frameRate: { ideal: this.currentConfig.frameRate },
      },
      audio: false,
    };

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      throw new Error(`Failed to access camera: ${error}`);
    }

    // Create video element
    this.videoElement = document.createElement('video');
    this.videoElement.srcObject = this.mediaStream;
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;

    // Wait for video to be ready
    await new Promise<void>((resolve, reject) => {
      if (!this.videoElement) {
        reject(new Error('Video element not created'));
        return;
      }

      this.videoElement.onloadedmetadata = () => {
        this.videoElement!.play()
          .then(() => {
            this.isStreaming = true;
            console.log(
              `[Camera] Streaming at ${this.videoElement!.videoWidth}x${this.videoElement!.videoHeight}`
            );
            resolve();
          })
          .catch(reject);
      };

      this.videoElement.onerror = () => {
        reject(new Error('Video element error'));
      };
    });
  }

  /**
   * Get current video frame as VideoFrame object (zero-copy)
   */
  getCurrentFrame(): CameraFrame | null {
    if (!this.videoElement || !this.isStreaming) {
      return null;
    }

    try {
      // Create VideoFrame from video element (zero-copy on supported browsers)
      const videoFrame = new VideoFrame(this.videoElement, {
        timestamp: performance.now() * 1000, // microseconds
      });

      return {
        videoFrame,
        timestamp: performance.now(),
        width: videoFrame.displayWidth,
        height: videoFrame.displayHeight,
      };
    } catch (error) {
      console.error('[Camera] Failed to create VideoFrame:', error);
      return null;
    }
  }

  /**
   * Get video element (for fallback rendering)
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Get actual camera resolution
   */
  getResolution(): { width: number; height: number } | null {
    if (!this.videoElement) {
      return null;
    }

    return {
      width: this.videoElement.videoWidth,
      height: this.videoElement.videoHeight,
    };
  }

  /**
   * Get camera capabilities
   */
  getCapabilities(): MediaTrackCapabilities | null {
    if (!this.mediaStream) {
      return null;
    }

    const videoTrack = this.mediaStream.getVideoTracks()[0];
    return videoTrack.getCapabilities();
  }

  /**
   * Update camera settings
   */
  async updateSettings(config: Partial<CameraConfig>): Promise<void> {
    if (!this.mediaStream) {
      throw new Error('Camera not initialized');
    }

    const videoTrack = this.mediaStream.getVideoTracks()[0];
    const constraints: MediaTrackConstraints = {};

    if (config.width !== undefined) {
      constraints.width = { ideal: config.width };
    }
    if (config.height !== undefined) {
      constraints.height = { ideal: config.height };
    }
    if (config.frameRate !== undefined) {
      constraints.frameRate = { ideal: config.frameRate };
    }

    await videoTrack.applyConstraints(constraints);
    this.currentConfig = { ...this.currentConfig, ...config };
  }

  /**
   * Check if camera is streaming
   */
  isReady(): boolean {
    return this.isStreaming;
  }

  /**
   * Stop camera stream and clean up resources
   */
  destroy(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.isStreaming = false;
  }
}
