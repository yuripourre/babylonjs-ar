/**
 * AR Debug Helper
 * Visualization and debugging utilities for developers
 */

import type { ARFrame } from '../core/engine';
import type { DetectedMarker } from '../core/detection/marker-detector';
import type { DetectedPlane } from '../core/detection/plane-detector';
import type { Vector3 } from '../core/math/vector';

export interface DebugConfig {
  showFPS?: boolean;
  showMarkers?: boolean;
  showPlanes?: boolean;
  showAxes?: boolean;
  showStats?: boolean;
  markerColor?: string;
  planeColor?: string;
  fontSize?: number;
}

/**
 * Canvas-based debug visualizer
 * Overlays AR detection results on a canvas
 */
export class ARDebug {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: Required<DebugConfig>;

  // Performance tracking
  private frameCount = 0;
  private lastFPSUpdate = performance.now();
  private fps = 0;
  private frameTime = 0;
  private lastFrameTime = performance.now();

  constructor(canvas: HTMLCanvasElement, config: DebugConfig = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context for debug canvas');
    }
    this.ctx = ctx;

    this.config = {
      showFPS: config.showFPS ?? true,
      showMarkers: config.showMarkers ?? true,
      showPlanes: config.showPlanes ?? true,
      showAxes: config.showAxes ?? true,
      showStats: config.showStats ?? true,
      markerColor: config.markerColor ?? '#00ff00',
      planeColor: config.planeColor ?? '#0088ff',
      fontSize: config.fontSize ?? 14,
    };

    // Auto-resize canvas
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  /**
   * Resize canvas to match window
   */
  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Draw AR frame with debug overlays
   */
  draw(frame: ARFrame): void {
    // Update performance metrics
    this.frameCount++;
    const now = performance.now();
    this.frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    if (now - this.lastFPSUpdate >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFPSUpdate));
      this.frameCount = 0;
      this.lastFPSUpdate = now;
    }

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw markers
    if (this.config.showMarkers && (frame as any).markers) {
      this.drawMarkers((frame as any).markers || [], frame.width, frame.height);
    }

    // Draw planes
    if (this.config.showPlanes && (frame as any).planes) {
      this.drawPlanes((frame as any).planes || []);
    }

    // Draw stats overlay
    if (this.config.showStats) {
      this.drawStats(frame);
    }

    // Draw FPS
    if (this.config.showFPS) {
      this.drawFPS();
    }
  }

  /**
   * Draw detected markers
   */
  private drawMarkers(markers: any[], frameWidth: number, frameHeight: number): void {
    // Only draw markers with corners (DetectedMarker type)
    const detectedMarkers = markers.filter((m) => m.corners);
    const scaleX = this.canvas.width / frameWidth;
    const scaleY = this.canvas.height / frameHeight;

    this.ctx.strokeStyle = this.config.markerColor;
    this.ctx.lineWidth = 3;
    this.ctx.font = `bold ${this.config.fontSize}px monospace`;
    this.ctx.fillStyle = this.config.markerColor;

    for (const marker of detectedMarkers) {
      const corners = [
        marker.corners.topLeft,
        marker.corners.topRight,
        marker.corners.bottomRight,
        marker.corners.bottomLeft,
      ];

      // Draw quad
      this.ctx.beginPath();
      this.ctx.moveTo(corners[0][0] * scaleX, corners[0][1] * scaleY);
      for (let i = 1; i < 4; i++) {
        this.ctx.lineTo(corners[i][0] * scaleX, corners[i][1] * scaleY);
      }
      this.ctx.closePath();
      this.ctx.stroke();

      // Draw corners
      for (const corner of corners) {
        this.ctx.beginPath();
        this.ctx.arc(corner[0] * scaleX, corner[1] * scaleY, 5, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Draw ID
      const centerX = corners.reduce((sum, c) => sum + c[0], 0) / 4;
      const centerY = corners.reduce((sum, c) => sum + c[1], 0) / 4;

      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(
        centerX * scaleX - 20,
        centerY * scaleY - 12,
        40,
        24
      );

      this.ctx.fillStyle = this.config.markerColor;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(
        `ID: ${marker.id}`,
        centerX * scaleX,
        centerY * scaleY
      );

      // Draw confidence
      this.ctx.font = `${this.config.fontSize - 2}px monospace`;
      this.ctx.fillText(
        `${(marker.confidence * 100).toFixed(0)}%`,
        centerX * scaleX,
        centerY * scaleY + 15
      );
    }
  }

  /**
   * Draw detected planes
   */
  private drawPlanes(planes: DetectedPlane[]): void {
    this.ctx.strokeStyle = this.config.planeColor;
    this.ctx.fillStyle = this.config.planeColor + '40'; // Semi-transparent
    this.ctx.lineWidth = 2;

    for (const plane of planes) {
      if (plane.boundary && plane.boundary.length > 0) {
        // Project 3D boundary to 2D (simplified - needs proper camera projection)
        const points2D = plane.boundary.map((p) => this.project3DTo2D(p));

        // Draw boundary polygon
        this.ctx.beginPath();
        this.ctx.moveTo(points2D[0].x, points2D[0].y);
        for (let i = 1; i < points2D.length; i++) {
          this.ctx.lineTo(points2D[i].x, points2D[i].y);
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // Draw plane info
        const center = this.project3DTo2D(plane.centroid);
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(center.x - 40, center.y - 25, 80, 50);

        this.ctx.fillStyle = this.config.planeColor;
        this.ctx.font = `${this.config.fontSize}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Plane ${plane.id ?? '?'}`, center.x, center.y - 5);
        this.ctx.font = `${this.config.fontSize - 2}px monospace`;
        this.ctx.fillText(
          `${plane.area.toFixed(2)}m²`,
          center.x,
          center.y + 10
        );
      }
    }
  }

  /**
   * Simple 3D to 2D projection (for visualization)
   */
  private project3DTo2D(point: Vector3): { x: number; y: number } {
    // Simplified orthographic projection
    // In real implementation, use camera intrinsics
    const scale = 100;
    return {
      x: this.canvas.width / 2 + point.x * scale,
      y: this.canvas.height / 2 - point.y * scale,
    };
  }

  /**
   * Draw statistics overlay
   */
  private drawStats(frame: ARFrame): void {
    const padding = 10;
    const lineHeight = this.config.fontSize + 4;
    let y = padding + lineHeight;

    this.ctx.font = `${this.config.fontSize}px monospace`;
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(padding, padding, 250, lineHeight * 6 + padding);

    this.ctx.fillStyle = 'white';
    this.ctx.textAlign = 'left';

    this.ctx.fillText(`Resolution: ${frame.width}×${frame.height}`, padding + 5, y);
    y += lineHeight;

    this.ctx.fillText(`Frame Time: ${this.frameTime.toFixed(2)}ms`, padding + 5, y);
    y += lineHeight;

    const markers = (frame as any).markers;
    if (markers && Array.isArray(markers)) {
      this.ctx.fillText(`Markers: ${markers.length}`, padding + 5, y);
      y += lineHeight;
    }

    const planes = (frame as any).planes;
    if (planes && Array.isArray(planes)) {
      this.ctx.fillText(`Planes: ${planes.length}`, padding + 5, y);
      y += lineHeight;
    }

    this.ctx.fillText(`Timestamp: ${frame.timestamp.toFixed(0)}ms`, padding + 5, y);
  }

  /**
   * Draw FPS counter
   */
  private drawFPS(): void {
    const padding = 10;
    const width = 100;
    const height = 40;
    const x = this.canvas.width - width - padding;
    const y = padding;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(x, y, width, height);

    // Color code FPS
    let color = '#00ff00'; // Green
    if (this.fps < 30) color = '#ff0000'; // Red
    else if (this.fps < 45) color = '#ffaa00'; // Orange

    this.ctx.fillStyle = color;
    this.ctx.font = `bold ${this.config.fontSize + 4}px monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${this.fps} FPS`, x + width / 2, y + height / 2 + 6);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DebugConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Take screenshot of debug canvas
   */
  screenshot(): string {
    return this.canvas.toDataURL('image/png');
  }

  /**
   * Clear canvas
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

/**
 * Create debug canvas overlay
 */
export function createDebugOverlay(config?: DebugConfig): {
  canvas: HTMLCanvasElement;
  debug: ARDebug;
} {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';

  document.body.appendChild(canvas);

  const debug = new ARDebug(canvas, config);

  return { canvas, debug };
}
