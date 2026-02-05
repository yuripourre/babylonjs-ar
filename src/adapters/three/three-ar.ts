/**
 * Three.js AR Adapter
 * Easy integration between AR Engine and Three.js
 *
 * Compatible with Three.js r150+
 */

import { AREngine, type ARFrame, type AREngineConfig } from '../../core/engine';
import { MarkerTrackingPlugin } from '../../plugins/marker-tracking-plugin';
import { type TrackedMarker } from '../../core/tracking/tracker';
import type { DetectedPlane } from '../../core/detection/plane-detector';
import type { Pose } from '../../core/tracking/pose-estimator';

// Three.js type imports (peer dependency)
export interface ThreeTypes {
  Scene: any;
  WebGLRenderer: any;
  PerspectiveCamera: any;
  Object3D: any;
  Group: any;
  VideoTexture: any;
  MeshBasicMaterial: any;
  PlaneGeometry: any;
  Mesh: any;
  Vector3: any;
  Quaternion: any;
  Color: any;
  LinearFilter: any;
  RGBFormat: any;
  DoubleSide: any;
}

export interface ThreeARConfig {
  arConfig?: AREngineConfig;
  canvas?: HTMLCanvasElement;
  enableMarkers?: boolean;
  enablePlanes?: boolean;
  markerConfig?: {
    dictionary?: 'ARUCO_4X4_50' | 'ARUCO_5X5_100' | 'ARUCO_6X6_250';
    markerSize?: number;
  };
  onReady?: () => void;
  onMarkerDetected?: (marker: any, anchor: any) => void;
  onPlaneDetected?: (plane: any, anchor: any) => void;
  THREE: ThreeTypes; // Three.js library object
}

/**
 * Three.js AR Integration
 * Bridges AR Engine with Three.js scene graph
 *
 * @example
 * ```typescript
 * import * as THREE from 'three';
 * import { ThreeAR } from 'babylonjs-ar/three';
 *
 * const ar = new ThreeAR({
 *   THREE,
 *   preset: 'desktop',
 *   enableMarkers: true,
 *   onMarkerDetected: (marker, anchor) => {
 *     const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
 *     const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
 *     const cube = new THREE.Mesh(geometry, material);
 *     anchor.add(cube);
 *   },
 * });
 *
 * await ar.start();
 * ```
 */
export class ThreeAR {
  // Three.js
  public scene: any;
  public camera: any;
  public renderer: any;
  private THREE: ThreeTypes;

  // AR
  private arEngine: AREngine;
  private isRunning = false;

  // Anchors
  private markerAnchors: Map<number, any> = new Map();
  private planeAnchors: Map<number, any> = new Map();
  private planeMeshes: Map<number, any> = new Map();
  private anchorParent: any;

  // Background
  private backgroundMesh: any | null = null;
  private backgroundTexture: any | null = null;
  private backgroundMaterial: any | null = null;

  // Config
  private config: ThreeARConfig;

  constructor(config: ThreeARConfig) {
    if (!config.THREE) {
      throw new Error('ThreeAR requires THREE.js library. Pass THREE as config.THREE');
    }

    this.config = config;
    this.THREE = config.THREE;

    // Create Three.js renderer
    const canvas = config.canvas || document.getElementById('renderCanvas') as HTMLCanvasElement;
    this.renderer = new this.THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Create scene
    this.scene = new this.THREE.Scene();

    // Create camera (will be updated with AR camera params)
    this.camera = new this.THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.01,
      1000
    );
    this.camera.position.z = 5;

    // Create anchor parent for all AR objects
    this.anchorParent = new this.THREE.Group();
    this.anchorParent.name = 'AR Root';
    this.scene.add(this.anchorParent);

    // Initialize AR engine (will be done in start())
    this.arEngine = new AREngine();
  }

  /**
   * Start AR session
   */
  async start(): Promise<void> {
    // Create AR engine with plugins
    this.arEngine = new AREngine();

    // Add marker tracking plugin if enabled
    if (this.config.enableMarkers) {
      this.arEngine.use(new MarkerTrackingPlugin(this.config.markerConfig || {}));
    }

    // Setup event listeners
    this.arEngine.on('frame', (frame) => this.onARFrame(frame as any));

    if (this.config.enableMarkers && this.config.onMarkerDetected) {
      this.arEngine.on('marker:detected', (marker) => {
        const anchor = this.getOrCreateMarkerAnchor(marker.id);
        this.config.onMarkerDetected!(marker, anchor);
      });
    }

    if (this.config.enablePlanes && this.config.onPlaneDetected) {
      this.arEngine.on('plane:detected', (plane: any) => {
        const planeId = typeof plane.id === 'number' ? plane.id : parseInt(plane.id || '0', 10);
        const anchor = this.getOrCreatePlaneAnchor(planeId);
        this.config.onPlaneDetected!(plane, anchor);
      });
    }

    this.arEngine.on('ready', () => {
      if (this.config.onReady) {
        this.config.onReady();
      }
    });

    // Initialize AR engine
    await this.arEngine.initialize(this.config.arConfig);

    // Note: Background texture setup removed as new AREngine doesn't expose video element
    // Users should render AR content directly to their scene

    // Start AR processing
    await this.arEngine.start();

    // Start render loop
    const animate = () => {
      if (!this.isRunning) return;
      requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
    };

    this.isRunning = true;
    animate();
  }

  /**
   * Get or create marker anchor
   */
  private getOrCreateMarkerAnchor(markerId: number): any {
    let anchor = this.markerAnchors.get(markerId);
    if (!anchor) {
      anchor = new this.THREE.Group();
      anchor.name = `Marker_${markerId}`;
      this.anchorParent.add(anchor);
      this.markerAnchors.set(markerId, anchor);
    }
    return anchor;
  }

  /**
   * Get or create plane anchor
   */
  private getOrCreatePlaneAnchor(planeId: number): any {
    let anchor = this.planeAnchors.get(planeId);
    if (!anchor) {
      anchor = new this.THREE.Group();
      anchor.name = `Plane_${planeId}`;
      this.anchorParent.add(anchor);
      this.planeAnchors.set(planeId, anchor);
    }
    return anchor;
  }

  /**
   * Handle AR frame
   */
  private onARFrame(frame: ARFrame): void {
    // Frame processing happens via event listeners
    // Update marker poses if they exist in frame
    if (frame.markers) {
      for (const marker of frame.markers as TrackedMarker[]) {
        const anchor = this.markerAnchors.get(marker.id);
        if (anchor && marker.pose) {
          this.updateAnchorFromPose(anchor, marker.pose);
        }
      }
    }

    // Update plane poses if they exist in frame
    if (frame.planes) {
      for (const plane of frame.planes as DetectedPlane[]) {
        const anchor = this.planeAnchors.get(plane.id || 0);
        if (anchor) {
          this.updateAnchorFromPlane(anchor, plane);
        }
      }
    }
  }

  /**
   * Update plane anchors
   */
  private updatePlaneAnchors(planes: DetectedPlane[]): void {
    const currentPlaneIds = new Set<number>();

    for (const plane of planes) {
      const id = plane.id || 0;
      currentPlaneIds.add(id);

      let anchor = this.planeAnchors.get(id);

      if (!anchor) {
        // Create new anchor
        anchor = new this.THREE.Group();
        anchor.name = `Plane_${id}`;
        this.anchorParent.add(anchor);
        this.planeAnchors.set(id, anchor);

        // Create visual plane mesh
        this.createPlaneMesh(id, plane, anchor);

        // Notify callback
        if (this.config.onPlaneDetected) {
          this.config.onPlaneDetected(plane, anchor);
        }
      }

      // Update anchor transform from plane
      this.updateAnchorFromPlane(anchor, plane);

      // Update plane mesh if exists
      const planeMesh = this.planeMeshes.get(id);
      if (planeMesh) {
        this.updatePlaneMesh(planeMesh, plane);
      }
    }

    // Remove lost planes
    for (const [id, anchor] of this.planeAnchors) {
      if (!currentPlaneIds.has(id)) {
        this.anchorParent.remove(anchor);
        this.planeAnchors.delete(id);

        const mesh = this.planeMeshes.get(id);
        if (mesh) {
          anchor.remove(mesh);
          this.planeMeshes.delete(id);
        }
      }
    }
  }

  /**
   * Create visual mesh for detected plane
   */
  private createPlaneMesh(id: number, plane: DetectedPlane, anchor: any): void {
    // Calculate plane size from area
    const planeSize = Math.sqrt(plane.area);

    // Create plane mesh
    const geometry = new this.THREE.PlaneGeometry(planeSize, planeSize);
    const material = new this.THREE.MeshBasicMaterial({
      color: new this.THREE.Color(0, 0.7, 1), // Cyan
      transparent: true,
      opacity: 0.3,
      side: this.THREE.DoubleSide,
    });

    const planeMesh = new this.THREE.Mesh(geometry, material);
    planeMesh.name = `PlaneMesh_${id}`;

    // Add to anchor
    anchor.add(planeMesh);
    this.planeMeshes.set(id, planeMesh);
  }

  /**
   * Update plane mesh geometry
   */
  private updatePlaneMesh(mesh: any, plane: DetectedPlane): void {
    // Update mesh scale based on plane area
    const planeSize = Math.sqrt(plane.area);
    mesh.scale.set(planeSize, planeSize, 1);
  }

  /**
   * Update anchor transform from pose
   */
  private updateAnchorFromPose(anchor: any, pose: Pose): void {
    // Convert AR pose to Three.js transform
    anchor.position.set(pose.position.x, pose.position.y, pose.position.z);

    anchor.quaternion.set(
      pose.rotation.x,
      pose.rotation.y,
      pose.rotation.z,
      pose.rotation.w
    );
  }

  /**
   * Update anchor transform from plane
   */
  private updateAnchorFromPlane(anchor: any, plane: DetectedPlane): void {
    // Position at plane centroid
    anchor.position.set(plane.centroid.x, plane.centroid.y, plane.centroid.z);

    // Orient to plane normal
    const up = new this.THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z);
    const lookAt = anchor.position.clone().add(up);
    anchor.lookAt(lookAt);
  }

  /**
   * Get anchor for marker
   */
  getMarkerAnchor(markerId: number): any | undefined {
    return this.markerAnchors.get(markerId);
  }

  /**
   * Get anchor for plane
   */
  getPlaneAnchor(planeId: number): any | undefined {
    return this.planeAnchors.get(planeId);
  }

  /**
   * Get all detected plane anchors
   */
  getAllPlaneAnchors(): any[] {
    return Array.from(this.planeAnchors.values());
  }

  /**
   * Get all detected marker anchors
   */
  getAllMarkerAnchors(): any[] {
    return Array.from(this.markerAnchors.values());
  }

  /**
   * Show/hide camera background
   */
  setBackgroundVisible(visible: boolean): void {
    if (this.backgroundMesh) {
      this.backgroundMesh.visible = visible;
    }
  }

  /**
   * Set background opacity
   */
  setBackgroundOpacity(opacity: number): void {
    if (this.backgroundMaterial) {
      this.backgroundMaterial.opacity = Math.max(0, Math.min(1, opacity));
      this.backgroundMaterial.transparent = opacity < 1;
    }
  }

  /**
   * Stop AR session
   */
  stop(): void {
    if (this.isRunning) {
      this.arEngine.stop();
      this.isRunning = false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();

    // Clean up background
    if (this.backgroundMesh) {
      this.scene.remove(this.backgroundMesh);
      this.backgroundMesh.geometry.dispose();
      this.backgroundMesh = null;
    }
    if (this.backgroundTexture) {
      this.backgroundTexture.dispose();
      this.backgroundTexture = null;
    }
    if (this.backgroundMaterial) {
      this.backgroundMaterial.dispose();
      this.backgroundMaterial = null;
    }

    // Clean up plane meshes
    for (const mesh of this.planeMeshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.planeMeshes.clear();

    // Clean up anchors
    for (const anchor of this.markerAnchors.values()) {
      this.anchorParent.remove(anchor);
    }
    this.markerAnchors.clear();

    for (const anchor of this.planeAnchors.values()) {
      this.anchorParent.remove(anchor);
    }
    this.planeAnchors.clear();

    // Dispose AR engine
    this.arEngine.destroy();
    this.renderer.dispose();
  }

  /**
   * Resize handler
   */
  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }
}

/**
 * Quick start helper for Three.js AR
 */
export async function createThreeAR(config: ThreeARConfig): Promise<ThreeAR> {
  const ar = new ThreeAR(config);
  await ar.start();
  return ar;
}
