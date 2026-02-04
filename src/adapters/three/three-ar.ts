/**
 * Three.js AR Adapter
 * Easy integration between AR Engine and Three.js
 *
 * Compatible with Three.js r150+
 */

import { AREngine, type ARFrame } from '../../core/engine';
import { ARBuilder, type ARPreset } from '../../core/ar-builder';
import type { DetectedMarker } from '../../core/detection/marker-detector';
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
  preset?: ARPreset;
  canvas?: HTMLCanvasElement;
  enableMarkers?: boolean;
  enablePlanes?: boolean;
  onReady?: () => void;
  onMarkerDetected?: (marker: DetectedMarker, anchor: any) => void;
  onPlaneDetected?: (plane: DetectedPlane, anchor: any) => void;
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
    // Build AR engine
    const builder = ARBuilder.preset(this.config.preset || 'desktop');

    if (this.config.enableMarkers) {
      builder.enableMarkers();
    }

    if (this.config.enablePlanes) {
      builder.enablePlanes();
    }

    builder.onFrame((frame) => this.onARFrame(frame));

    this.arEngine = await builder.build();

    // Setup background video texture
    this.setupBackgroundTexture();

    // Start render loop
    const animate = () => {
      if (!this.isRunning) return;
      requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
    };

    this.isRunning = true;
    animate();

    if (this.config.onReady) {
      this.config.onReady();
    }
  }

  /**
   * Setup background texture for camera feed
   */
  private setupBackgroundTexture(): void {
    // Get video element from camera manager
    const videoElement = this.arEngine.getCameraManager().getVideoElement();
    if (!videoElement) return;

    // Create video texture from camera feed
    this.backgroundTexture = new this.THREE.VideoTexture(videoElement);
    this.backgroundTexture.minFilter = this.THREE.LinearFilter;
    this.backgroundTexture.magFilter = this.THREE.LinearFilter;
    this.backgroundTexture.format = this.THREE.RGBFormat;

    // Create material for background
    this.backgroundMaterial = new this.THREE.MeshBasicMaterial({
      map: this.backgroundTexture,
      depthTest: false,
      depthWrite: false,
    });

    // Get camera resolution for aspect ratio
    const resolution = this.arEngine.getCameraManager().getResolution();
    if (!resolution) return;

    const aspectRatio = resolution.width / resolution.height;
    const planeHeight = 2;
    const planeWidth = planeHeight * aspectRatio;

    // Create background plane
    const geometry = new this.THREE.PlaneGeometry(planeWidth, planeHeight);
    this.backgroundMesh = new this.THREE.Mesh(geometry, this.backgroundMaterial);

    // Position background far from camera
    this.backgroundMesh.position.z = -10;
    this.backgroundMesh.scale.y = -1; // Flip vertically to match camera

    // Add to scene (render first)
    this.backgroundMesh.renderOrder = -1;
    this.scene.add(this.backgroundMesh);
  }

  /**
   * Handle AR frame
   */
  private onARFrame(frame: ARFrame): void {
    // Background texture is automatically updated from video element
    // via VideoTexture

    // Update marker anchors
    if (frame.markers && this.config.enableMarkers) {
      this.updateMarkerAnchors(frame.markers);
    }

    // Update plane anchors
    if (frame.planes && this.config.enablePlanes) {
      this.updatePlaneAnchors(frame.planes);
    }
  }

  /**
   * Update marker anchors
   */
  private updateMarkerAnchors(markers: any[]): void {
    const currentMarkerIds = new Set<number>();

    for (const trackedMarker of markers) {
      const id = trackedMarker.id;
      currentMarkerIds.add(id);

      let anchor = this.markerAnchors.get(id);

      if (!anchor) {
        // Create new anchor (Three.js Group)
        anchor = new this.THREE.Group();
        anchor.name = `Marker_${id}`;
        this.anchorParent.add(anchor);
        this.markerAnchors.set(id, anchor);

        // Notify callback
        if (this.config.onMarkerDetected) {
          // Create a DetectedMarker from TrackedMarker
          const detectedMarker: any = { id };
          this.config.onMarkerDetected(detectedMarker, anchor);
        }
      }

      // Update anchor transform from pose
      if (trackedMarker.pose) {
        this.updateAnchorFromPose(anchor, trackedMarker.pose);
      }
    }

    // Remove lost markers
    for (const [id, anchor] of this.markerAnchors) {
      if (!currentMarkerIds.has(id)) {
        this.anchorParent.remove(anchor);
        this.markerAnchors.delete(id);
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
