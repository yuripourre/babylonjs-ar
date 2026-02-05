/**
 * SLAM Map
 * Manages keyframes, map points, and covisibility graph
 */

import type {
  SLAMMap,
  Keyframe,
  MapPoint,
  SerializedMap,
  CameraIntrinsics,
} from './types';
import { Vector3 } from '../math/vector';
import { Quaternion } from '../math/quaternion';
import { Matrix4 } from '../math/matrix';
import { generateId } from '../../utils/id-generator';

export class SLAMMapManager {
  private map: SLAMMap;
  private nextKeyframeId = 0;
  private nextMapPointId = 0;

  constructor(name: string = 'Untitled SLAMMap') {
    this.map = {
      id: generateId(),
      name,
      keyframes: new Map(),
      mapPoints: new Map(),
      covisibilityGraph: new Map(),
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      metadata: {
        version: '1.0.0',
      },
    };
  }

  /**
   * Add keyframe to map
   */
  addKeyframe(keyframe: Omit<Keyframe, 'id'>): Keyframe {
    const id = this.nextKeyframeId++;
    const fullKeyframe: Keyframe = { ...keyframe, id };

    this.map.keyframes.set(id, fullKeyframe);
    this.map.covisibilityGraph.set(id, new Set());
    this.map.lastUpdatedAt = Date.now();

    // Update covisibility graph
    this.updateCovisibility(fullKeyframe);

    console.log(`[SLAM Map] Added keyframe ${id} (total: ${this.map.keyframes.size})`);

    return fullKeyframe;
  }

  /**
   * Add map point
   */
  addMapPoint(mapPoint: Omit<MapPoint, 'id'>): MapPoint {
    const id = this.nextMapPointId++;
    const fullMapPoint: MapPoint = { ...mapPoint, id };

    this.map.mapPoints.set(id, fullMapPoint);
    this.map.lastUpdatedAt = Date.now();

    return fullMapPoint;
  }

  /**
   * Get keyframe by ID
   */
  getKeyframe(id: number): Keyframe | undefined {
    return this.map.keyframes.get(id);
  }

  /**
   * Get map point by ID
   */
  getMapPoint(id: number): MapPoint | undefined {
    return this.map.mapPoints.get(id);
  }

  /**
   * Get all keyframes
   */
  getAllKeyframes(): Keyframe[] {
    return Array.from(this.map.keyframes.values());
  }

  /**
   * Get all map points
   */
  getAllMapPoints(): MapPoint[] {
    return Array.from(this.map.mapPoints.values());
  }

  /**
   * Get recent keyframes (last N)
   */
  getRecentKeyframes(count: number): Keyframe[] {
    const all = this.getAllKeyframes();
    return all.slice(-count);
  }

  /**
   * Update covisibility graph
   * Connects keyframes that observe common map points
   */
  private updateCovisibility(keyframe: Keyframe): void {
    const keyframeId = keyframe.id;
    const currentConnections = this.map.covisibilityGraph.get(keyframeId)!;

    // Count shared map points with each other keyframe
    const sharedPointCounts = new Map<number, number>();

    for (const mapPointId of keyframe.mapPoints) {
      const mapPoint = this.map.mapPoints.get(mapPointId);
      if (!mapPoint) {continue;}

      for (const otherKeyframeId of mapPoint.observations) {
        if (otherKeyframeId === keyframeId) {continue;}

        const count = sharedPointCounts.get(otherKeyframeId) ?? 0;
        sharedPointCounts.set(otherKeyframeId, count + 1);
      }
    }

    // Connect keyframes with enough shared points (threshold: 15)
    const MIN_SHARED_POINTS = 15;

    for (const [otherKeyframeId, count] of sharedPointCounts) {
      if (count >= MIN_SHARED_POINTS) {
        // Bidirectional connection
        currentConnections.add(otherKeyframeId);

        const otherConnections = this.map.covisibilityGraph.get(otherKeyframeId);
        if (otherConnections) {
          otherConnections.add(keyframeId);
        }
      }
    }
  }

  /**
   * Get covisible keyframes for a given keyframe
   */
  getCovisibleKeyframes(keyframeId: number): Set<number> {
    return this.map.covisibilityGraph.get(keyframeId) ?? new Set();
  }

  /**
   * Get keyframes within radius of position
   */
  getNearbyKeyframes(position: Vector3, radius: number): Keyframe[] {
    const nearby: Keyframe[] = [];

    for (const keyframe of this.map.keyframes.values()) {
      const distance = Vector3.distance(position, keyframe.pose.position);
      if (distance <= radius) {
        nearby.push(keyframe);
      }
    }

    return nearby;
  }

  /**
   * Update map point
   */
  updateMapPoint(id: number, updates: Partial<MapPoint>): void {
    const mapPoint = this.map.mapPoints.get(id);
    if (!mapPoint) {return;}

    Object.assign(mapPoint, updates);
    this.map.lastUpdatedAt = Date.now();
  }

  /**
   * Remove bad map points
   */
  cullBadMapPoints(): number {
    let culled = 0;

    for (const [id, mapPoint] of this.map.mapPoints) {
      if (mapPoint.trackingState === 'bad' || mapPoint.observations.length === 0) {
        this.map.mapPoints.delete(id);
        culled++;
      }
    }

    if (culled > 0) {
      console.log(`[SLAM Map] Culled ${culled} bad map points`);
      this.map.lastUpdatedAt = Date.now();
    }

    return culled;
  }

  /**
   * Remove old keyframes (keep only recent N)
   */
  cullOldKeyframes(maxKeyframes: number): number {
    const keyframes = this.getAllKeyframes();
    if (keyframes.length <= maxKeyframes) {return 0;}

    const toRemove = keyframes.length - maxKeyframes;
    const oldKeyframes = keyframes.slice(0, toRemove);

    for (const keyframe of oldKeyframes) {
      this.removeKeyframe(keyframe.id);
    }

    console.log(`[SLAM Map] Culled ${toRemove} old keyframes`);
    return toRemove;
  }

  /**
   * Remove keyframe and associated data
   */
  private removeKeyframe(id: number): void {
    const keyframe = this.map.keyframes.get(id);
    if (!keyframe) {return;}

    // Remove from covisibility graph
    this.map.covisibilityGraph.delete(id);

    // Remove connections from other keyframes
    for (const connections of this.map.covisibilityGraph.values()) {
      connections.delete(id);
    }

    // Remove observations from map points
    for (const mapPointId of keyframe.mapPoints) {
      const mapPoint = this.map.mapPoints.get(mapPointId);
      if (mapPoint) {
        mapPoint.observations = mapPoint.observations.filter(kfId => kfId !== id);

        // Remove map point if no observations left
        if (mapPoint.observations.length === 0) {
          this.map.mapPoints.delete(mapPointId);
        }
      }
    }

    this.map.keyframes.delete(id);
    this.map.lastUpdatedAt = Date.now();
  }

  /**
   * Get map statistics
   */
  getStats(): {
    numKeyframes: number;
    numMapPoints: number;
    numConnections: number;
    mapSizeKB: number;
  } {
    let numConnections = 0;
    for (const connections of this.map.covisibilityGraph.values()) {
      numConnections += connections.size;
    }
    numConnections /= 2; // Bidirectional, so divide by 2

    // Estimate map size
    const keyframeSize = 1024; // ~1KB per keyframe (conservative)
    const mapPointSize = 128; // ~128 bytes per map point
    const mapSizeKB = (
      this.map.keyframes.size * keyframeSize +
      this.map.mapPoints.size * mapPointSize
    ) / 1024;

    return {
      numKeyframes: this.map.keyframes.size,
      numMapPoints: this.map.mapPoints.size,
      numConnections,
      mapSizeKB: Math.round(mapSizeKB),
    };
  }

  /**
   * Get map name
   */
  getName(): string {
    return this.map.name;
  }

  /**
   * Set map name
   */
  setName(name: string): void {
    this.map.name = name;
    this.map.lastUpdatedAt = Date.now();
  }

  /**
   * Clear entire map
   */
  clear(): void {
    this.map.keyframes.clear();
    this.map.mapPoints.clear();
    this.map.covisibilityGraph.clear();
    this.nextKeyframeId = 0;
    this.nextMapPointId = 0;
    this.map.lastUpdatedAt = Date.now();

    console.log('[SLAM Map] Cleared');
  }

  /**
   * Get map bounds (min/max coordinates)
   */
  getBounds(): { min: Vector3; max: Vector3 } | null {
    if (this.map.keyframes.size === 0) {return null;}

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const keyframe of this.map.keyframes.values()) {
      const pos = keyframe.pose.position;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      minZ = Math.min(minZ, pos.z);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
      maxZ = Math.max(maxZ, pos.z);
    }

    return {
      min: new Vector3(minX, minY, minZ),
      max: new Vector3(maxX, maxY, maxZ),
    };
  }

  /**
   * Serialize map for persistence
   */
  serialize(): SerializedMap {
    const keyframes = Array.from(this.map.keyframes.values()).map(kf => ({
      id: kf.id,
      timestamp: kf.timestamp,
      pose: {
        position: [kf.pose.position.x, kf.pose.position.y, kf.pose.position.z] as [number, number, number],
        rotation: [
          kf.pose.rotation.x,
          kf.pose.rotation.y,
          kf.pose.rotation.z,
          kf.pose.rotation.w,
        ] as [number, number, number, number],
      },
      features: kf.features.map(f => ({
        x: f.x,
        y: f.y,
        octave: f.octave,
        angle: f.angle,
        descriptor: Array.from(f.descriptor),
        mapPointId: f.mapPointId,
      })),
      covisibleKeyframes: kf.covisibleKeyframes,
      mapPoints: kf.mapPoints,
    }));

    const mapPoints = Array.from(this.map.mapPoints.values()).map(mp => ({
      id: mp.id,
      position: [mp.position.x, mp.position.y, mp.position.z] as [number, number, number],
      descriptor: Array.from(mp.descriptor),
      observations: mp.observations,
      normal: [mp.normal.x, mp.normal.y, mp.normal.z] as [number, number, number],
      minDistance: mp.minDistance,
      maxDistance: mp.maxDistance,
      trackingState: mp.trackingState,
    }));

    const serialized: SerializedMap = {
      version: '1.0.0',
      map: {
        id: this.map.id,
        name: this.map.name,
        metadata: this.map.metadata,
        keyframes,
        mapPoints,
      },
      compressed: false,
      checksum: '', // TODO: Add checksum
    };

    return serialized;
  }

  /**
   * Deserialize map from storage
   */
  static deserialize(data: SerializedMap): SLAMMapManager {
    const map = new SLAMMapManager(data.map.name);
    map.map.id = data.map.id;
    map.map.metadata = data.map.metadata;

    // Restore keyframes
    for (const kfData of data.map.keyframes) {
      const keyframe: Keyframe = {
        id: kfData.id,
        timestamp: kfData.timestamp,
        pose: {
          position: new Vector3(...kfData.pose.position),
          rotation: new Quaternion(
            kfData.pose.rotation[0],
            kfData.pose.rotation[1],
            kfData.pose.rotation[2],
            kfData.pose.rotation[3]
          ),
          transform: Matrix4.identity(), // TODO: Reconstruct
          inverse: Matrix4.identity(),
        },
        features: kfData.features.map(f => ({
          x: f.x,
          y: f.y,
          octave: f.octave,
          angle: f.angle,
          descriptor: new Uint8Array(f.descriptor),
          mapPointId: f.mapPointId,
        })),
        covisibleKeyframes: kfData.covisibleKeyframes,
        mapPoints: kfData.mapPoints,
        intrinsics: {
          fx: 800, fy: 800, cx: 640, cy: 360, // TODO: Store intrinsics
        },
      };

      map.map.keyframes.set(keyframe.id, keyframe);
      map.nextKeyframeId = Math.max(map.nextKeyframeId, keyframe.id + 1);
    }

    // Restore map points
    for (const mpData of data.map.mapPoints) {
      const mapPoint: MapPoint = {
        id: mpData.id,
        position: new Vector3(...mpData.position),
        descriptor: new Uint8Array(mpData.descriptor),
        observations: mpData.observations,
        normal: new Vector3(...mpData.normal),
        minDistance: mpData.minDistance,
        maxDistance: mpData.maxDistance,
        trackingState: mpData.trackingState,
        createdAt: Date.now(),
      };

      map.map.mapPoints.set(mapPoint.id, mapPoint);
      map.nextMapPointId = Math.max(map.nextMapPointId, mapPoint.id + 1);
    }

    // Rebuild covisibility graph
    for (const keyframe of map.map.keyframes.values()) {
      map.map.covisibilityGraph.set(keyframe.id, new Set(keyframe.covisibleKeyframes));
    }

    console.log(`[SLAM Map] Deserialized map with ${map.map.keyframes.size} keyframes, ${map.map.mapPoints.size} map points`);

    return map;
  }

  /**
   * Get raw map data (for advanced use)
   */
  getRawMap(): SLAMMap {
    return this.map;
  }
}
