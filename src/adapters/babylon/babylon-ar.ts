/**
 * Babylon.js AR Adapter
 * Easy integration between AR Engine and Babylon.js
 */

import {
  Scene,
  Engine,
  Camera,
  ArcRotateCamera,
  Vector3,
  Mesh,
  MeshBuilder,
  TransformNode,
  Matrix,
  Quaternion,
  HemisphericLight,
  Color3,
  Texture,
  VideoTexture,
  StandardMaterial,
  Color4,
} from '@babylonjs/core';
import { AREngine, type ARFrame, type AREngineConfig } from '../../core/engine';
import { MarkerTrackingPlugin } from '../../plugins/marker-tracking-plugin';
import { type TrackedMarker } from '../../core/tracking/tracker';
import type { DetectedPlane } from '../../core/detection/plane-detector';
import type { Pose } from '../../core/tracking/pose-estimator';

export interface BabylonARConfig {
  arConfig?: AREngineConfig;
  canvas?: HTMLCanvasElement;
  enableMarkers?: boolean;
  enablePlanes?: boolean;
  markerConfig?: {
    dictionary?: 'ARUCO_4X4_50' | 'ARUCO_5X5_100' | 'ARUCO_6X6_250';
    markerSize?: number;
  };
  onReady?: () => void;
  onMarkerDetected?: (marker: any, anchor: TransformNode) => void;
  onPlaneDetected?: (plane: any, anchor: TransformNode) => void;
}

/**
 * Babylon.js AR Integration
 * Bridges AR Engine with Babylon.js scene graph
 */
export class BabylonAR {
  // Babylon.js
  public scene: Scene;
  public camera: Camera;
  private engine: Engine;

  // AR
  private arEngine: AREngine;
  private isRunning = false;

  // Anchors
  private markerAnchors: Map<number, TransformNode> = new Map();
  private planeAnchors: Map<number, TransformNode> = new Map();
  private planeMeshes: Map<number, Mesh> = new Map();
  private anchorParent: TransformNode;

  // Background
  private backgroundPlane: Mesh | null = null;
  private backgroundTexture: VideoTexture | null = null;
  private backgroundMaterial: StandardMaterial | null = null;

  // Config
  private config: BabylonARConfig;

  constructor(config: BabylonARConfig) {
    this.config = config;

    // Create Babylon.js engine and scene
    const canvas = config.canvas || document.getElementById('renderCanvas') as HTMLCanvasElement;
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);

    // Create camera
    this.camera = new ArcRotateCamera(
      'camera',
      0,
      0,
      10,
      Vector3.Zero(),
      this.scene
    );

    // Create anchor parent for all AR objects
    this.anchorParent = new TransformNode('AR Root', this.scene);

    // Create default lighting
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
    light.intensity = 0.7;

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
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    this.isRunning = true;
  }

  /**
   * Get or create marker anchor
   */
  private getOrCreateMarkerAnchor(markerId: number): TransformNode {
    let anchor = this.markerAnchors.get(markerId);
    if (!anchor) {
      anchor = new TransformNode(`Marker_${markerId}`, this.scene);
      anchor.parent = this.anchorParent;
      this.markerAnchors.set(markerId, anchor);
    }
    return anchor;
  }

  /**
   * Get or create plane anchor
   */
  private getOrCreatePlaneAnchor(planeId: number): TransformNode {
    let anchor = this.planeAnchors.get(planeId);
    if (!anchor) {
      anchor = new TransformNode(`Plane_${planeId}`, this.scene);
      anchor.parent = this.anchorParent;
      this.planeAnchors.set(planeId, anchor);
    }
    return anchor;
  }

  /**
   * Process AR frame from image
   */
  async processImage(image: HTMLImageElement | HTMLCanvasElement): Promise<void> {
    // Note: New plugin-based AREngine architecture doesn't support direct image input
    // Use camera-based AR or implement a custom plugin for image processing
    console.warn('processImage is not supported in V2 architecture. Use camera-based AR instead.');
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
        anchor = new TransformNode(`Plane_${id}`, this.scene);
        anchor.parent = this.anchorParent;
        this.planeAnchors.set(id, anchor);

        // Create visual plane mesh
        this.createPlaneMesh(id, plane);

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
        anchor.dispose();
        this.planeAnchors.delete(id);

        const mesh = this.planeMeshes.get(id);
        if (mesh) {
          mesh.dispose();
          this.planeMeshes.delete(id);
        }
      }
    }
  }

  /**
   * Create visual mesh for detected plane
   */
  private createPlaneMesh(id: number, plane: DetectedPlane): void {
    // Calculate plane size from area
    const planeSize = Math.sqrt(plane.area);

    // Create plane mesh
    const planeMesh = MeshBuilder.CreatePlane(
      `PlaneMesh_${id}`,
      { width: planeSize, height: planeSize },
      this.scene
    );

    // Create semi-transparent material
    const material = new StandardMaterial(`PlaneMat_${id}`, this.scene);
    material.diffuseColor = new Color3(0, 0.7, 1); // Cyan
    material.alpha = 0.3; // Semi-transparent
    material.backFaceCulling = false; // Render both sides

    planeMesh.material = material;

    // Parent to anchor
    const anchor = this.planeAnchors.get(id);
    if (anchor) {
      planeMesh.parent = anchor;
    }

    this.planeMeshes.set(id, planeMesh);
  }

  /**
   * Update plane mesh geometry
   */
  private updatePlaneMesh(mesh: Mesh, plane: DetectedPlane): void {
    // Update mesh scale based on plane area
    const planeSize = Math.sqrt(plane.area);
    mesh.scaling.x = planeSize;
    mesh.scaling.y = planeSize;
  }

  /**
   * Update anchor transform from pose
   */
  private updateAnchorFromPose(anchor: TransformNode, pose: Pose): void {
    // Convert AR pose to Babylon.js transform
    anchor.position = new Vector3(
      pose.position.x,
      pose.position.y,
      pose.position.z
    );

    anchor.rotationQuaternion = new Quaternion(
      pose.rotation.x,
      pose.rotation.y,
      pose.rotation.z,
      pose.rotation.w
    );
  }

  /**
   * Update anchor transform from plane
   */
  private updateAnchorFromPlane(anchor: TransformNode, plane: DetectedPlane): void {
    // Position at plane centroid
    anchor.position = new Vector3(
      plane.centroid.x,
      plane.centroid.y,
      plane.centroid.z
    );

    // Orient to plane normal
    const up = new Vector3(plane.normal.x, plane.normal.y, plane.normal.z);
    const forward = Vector3.Cross(up, Vector3.Right());
    const right = Vector3.Cross(forward, up);

    const matrix = Matrix.Identity();
    Matrix.FromValuesToRef(
      right.x, right.y, right.z, 0,
      up.x, up.y, up.z, 0,
      forward.x, forward.y, forward.z, 0,
      0, 0, 0, 1,
      matrix
    );

    anchor.rotationQuaternion = Quaternion.FromRotationMatrix(matrix);
  }

  /**
   * Get anchor for marker
   */
  getMarkerAnchor(markerId: number): TransformNode | undefined {
    return this.markerAnchors.get(markerId);
  }

  /**
   * Get anchor for plane
   */
  getPlaneAnchor(planeId: number): TransformNode | undefined {
    return this.planeAnchors.get(planeId);
  }

  /**
   * Create mesh at marker
   */
  createMeshAtMarker(markerId: number, createMeshFn: (anchor: TransformNode) => Mesh): Mesh | null {
    const anchor = this.markerAnchors.get(markerId);
    if (!anchor) return null;

    const mesh = createMeshFn(anchor);
    mesh.parent = anchor;
    return mesh;
  }

  /**
   * Create mesh at plane
   */
  createMeshAtPlane(planeId: number, createMeshFn: (anchor: TransformNode) => Mesh): Mesh | null {
    const anchor = this.planeAnchors.get(planeId);
    if (!anchor) return null;

    const mesh = createMeshFn(anchor);
    mesh.parent = anchor;
    return mesh;
  }

  /**
   * Stop AR session
   */
  stop(): void {
    if (this.isRunning) {
      this.arEngine.stop();
      this.engine.stopRenderLoop();
      this.isRunning = false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();

    // Clean up background
    if (this.backgroundPlane) {
      this.backgroundPlane.dispose();
      this.backgroundPlane = null;
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
      mesh.dispose();
    }
    this.planeMeshes.clear();

    // Clean up anchors
    for (const anchor of this.markerAnchors.values()) {
      anchor.dispose();
    }
    this.markerAnchors.clear();

    for (const anchor of this.planeAnchors.values()) {
      anchor.dispose();
    }
    this.planeAnchors.clear();

    // Dispose AR engine and scene
    this.arEngine.destroy();
    this.scene.dispose();
    this.engine.dispose();
  }

  /**
   * Show/hide camera background
   */
  setBackgroundVisible(visible: boolean): void {
    if (this.backgroundPlane) {
      this.backgroundPlane.setEnabled(visible);
    }
  }

  /**
   * Set background opacity
   */
  setBackgroundOpacity(opacity: number): void {
    if (this.backgroundMaterial) {
      this.backgroundMaterial.alpha = Math.max(0, Math.min(1, opacity));
    }
  }

  /**
   * Get all detected plane anchors
   */
  getAllPlaneAnchors(): TransformNode[] {
    return Array.from(this.planeAnchors.values());
  }

  /**
   * Get all detected marker anchors
   */
  getAllMarkerAnchors(): TransformNode[] {
    return Array.from(this.markerAnchors.values());
  }

  /**
   * Resize handler
   */
  resize(): void {
    this.engine.resize();
  }
}

/**
 * Quick start helper for Babylon.js AR
 */
export async function createBabylonAR(config: BabylonARConfig): Promise<BabylonAR> {
  const ar = new BabylonAR(config);
  await ar.start();
  return ar;
}
