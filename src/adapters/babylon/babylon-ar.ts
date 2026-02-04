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
import { AREngine, type ARFrame } from '../../core/engine';
import { ARBuilder, type ARPreset } from '../../core/ar-builder';
import type { DetectedMarker } from '../../core/detection/marker-detector';
import type { DetectedPlane } from '../../core/detection/plane-detector';
import type { Pose } from '../../core/tracking/pose-estimator';

export interface BabylonARConfig {
  preset?: ARPreset;
  canvas?: HTMLCanvasElement;
  enableMarkers?: boolean;
  enablePlanes?: boolean;
  onReady?: () => void;
  onMarkerDetected?: (marker: DetectedMarker, anchor: TransformNode) => void;
  onPlaneDetected?: (plane: DetectedPlane, anchor: TransformNode) => void;
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
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    this.isRunning = true;

    if (this.config.onReady) {
      this.config.onReady();
    }
  }

  /**
   * Process AR frame from image
   */
  async processImage(image: HTMLImageElement | HTMLCanvasElement): Promise<void> {
    // This would require updating AREngine to support image input
    // For now, this is a placeholder
    console.log('Processing image:', image.width, image.height);
  }

  /**
   * Setup background texture for camera feed
   */
  private setupBackgroundTexture(): void {
    // Get video element from camera manager
    const videoElement = this.arEngine.getCameraManager().getVideoElement();
    if (!videoElement) return;

    // Create video texture from camera feed
    this.backgroundTexture = new VideoTexture(
      'backgroundTexture',
      videoElement,
      this.scene,
      false, // Don't generate mip maps
      false, // Not invertY (we'll flip the plane instead)
      Texture.TRILINEAR_SAMPLINGMODE,
      {
        autoUpdateTexture: true, // Auto-update each frame
        autoPlay: true,
      }
    );

    // Create material for background
    this.backgroundMaterial = new StandardMaterial('backgroundMaterial', this.scene);
    this.backgroundMaterial.diffuseTexture = this.backgroundTexture;
    this.backgroundMaterial.emissiveTexture = this.backgroundTexture; // Make it self-illuminated
    this.backgroundMaterial.disableLighting = true; // Don't apply scene lighting
    this.backgroundMaterial.backFaceCulling = false; // Render both sides

    // Create background plane
    if (!this.backgroundPlane) {
      // Calculate aspect ratio
      const resolution = this.arEngine.getCameraManager().getResolution();
      if (!resolution) return;

      const aspectRatio = resolution.width / resolution.height;
      const planeHeight = 100;
      const planeWidth = planeHeight * aspectRatio;

      this.backgroundPlane = MeshBuilder.CreatePlane(
        'background',
        { width: planeWidth, height: planeHeight },
        this.scene
      );

      this.backgroundPlane.position.z = 50; // Far back in scene
      this.backgroundPlane.scaling.y = -1; // Flip vertically to match camera
      this.backgroundPlane.material = this.backgroundMaterial;

      // Make sure background renders behind everything else
      this.backgroundPlane.renderingGroupId = 0;
      this.backgroundPlane.isPickable = false; // Don't interfere with raycasting
    }
  }

  /**
   * Handle AR frame
   */
  private onARFrame(frame: ARFrame): void {
    // Background texture is automatically updated from video element
    // via VideoTexture's autoUpdateTexture setting
    // No manual copying needed!

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
        // Create new anchor
        anchor = new TransformNode(`Marker_${id}`, this.scene);
        anchor.parent = this.anchorParent;
        this.markerAnchors.set(id, anchor);

        // Notify callback
        if (this.config.onMarkerDetected) {
          // Create a DetectedMarker from TrackedMarker
          // This is a simplified conversion
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
        anchor.dispose();
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
