/**
 * Sparse Voxel Grid
 * Memory-efficient 3D voxel storage using spatial hashing
 *
 * Features:
 * - O(1) voxel lookup/insertion
 * - Only allocates memory for occupied voxels
 * - Typical memory: 20-30MB vs 128MB for dense grid
 * - Supports TSDF (Truncated Signed Distance Field)
 */

import { Vector3 } from '../math/vector';
import { Logger } from '../../utils/logger';

const log = Logger.create('SparseVoxelGrid');

/**
 * Voxel data (TSDF)
 */
export interface Voxel {
  tsdf: number;      // Signed distance (-1 to 1)
  weight: number;    // Confidence weight
  color?: [number, number, number]; // Optional RGB color
}

/**
 * Voxel grid configuration
 */
export interface VoxelGridConfig {
  voxelSize: number;           // Size of each voxel in meters
  truncationDistance: number;  // TSDF truncation distance
  maxWeight: number;           // Maximum voxel weight
  maxVoxels?: number;          // Memory limit (number of voxels)
}

/**
 * Voxel coordinate (integer grid position)
 */
interface VoxelCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Sparse voxel grid using spatial hash map
 */
export class SparseVoxelGrid {
  private config: Required<VoxelGridConfig>;
  private voxels: Map<string, Voxel>;
  private bounds: {
    min: Vector3;
    max: Vector3;
  };

  constructor(config: VoxelGridConfig) {
    this.config = {
      voxelSize: config.voxelSize,
      truncationDistance: config.truncationDistance,
      maxWeight: config.maxWeight,
      maxVoxels: config.maxVoxels ?? 1_000_000,
    };

    this.voxels = new Map();
    this.bounds = {
      min: new Vector3(Infinity, Infinity, Infinity),
      max: new Vector3(-Infinity, -Infinity, -Infinity),
    };

    log.info('Sparse voxel grid initialized', {
      voxelSize: this.config.voxelSize,
      maxVoxels: this.config.maxVoxels,
    });
  }

  /**
   * World position to voxel coordinates
   */
  worldToVoxel(position: Vector3): VoxelCoord {
    return {
      x: Math.floor(position.x / this.config.voxelSize),
      y: Math.floor(position.y / this.config.voxelSize),
      z: Math.floor(position.z / this.config.voxelSize),
    };
  }

  /**
   * Voxel coordinates to world position (center)
   */
  voxelToWorld(coord: VoxelCoord): Vector3 {
    const half = this.config.voxelSize / 2;
    return new Vector3(
      coord.x * this.config.voxelSize + half,
      coord.y * this.config.voxelSize + half,
      coord.z * this.config.voxelSize + half
    );
  }

  /**
   * Hash voxel coordinates to string key
   */
  private hashCoord(coord: VoxelCoord): string {
    return `${coord.x},${coord.y},${coord.z}`;
  }

  /**
   * Parse hash key back to coordinates
   */
  private unhashCoord(key: string): VoxelCoord {
    const [x, y, z] = key.split(',').map(Number);
    return { x, y, z };
  }

  /**
   * Get voxel at world position
   */
  getVoxelWorld(position: Vector3): Voxel | undefined {
    const coord = this.worldToVoxel(position);
    return this.getVoxel(coord);
  }

  /**
   * Get voxel at grid coordinates
   */
  getVoxel(coord: VoxelCoord): Voxel | undefined {
    const key = this.hashCoord(coord);
    return this.voxels.get(key);
  }

  /**
   * Set voxel at grid coordinates
   */
  setVoxel(coord: VoxelCoord, voxel: Voxel): boolean {
    // Check memory limit
    const key = this.hashCoord(coord);
    if (!this.voxels.has(key) && this.voxels.size >= this.config.maxVoxels) {
      // Grid is full, can't add more voxels
      return false;
    }

    this.voxels.set(key, voxel);

    // Update bounds
    const worldPos = this.voxelToWorld(coord);
    this.bounds.min.x = Math.min(this.bounds.min.x, worldPos.x);
    this.bounds.min.y = Math.min(this.bounds.min.y, worldPos.y);
    this.bounds.min.z = Math.min(this.bounds.min.z, worldPos.z);
    this.bounds.max.x = Math.max(this.bounds.max.x, worldPos.x);
    this.bounds.max.y = Math.max(this.bounds.max.y, worldPos.y);
    this.bounds.max.z = Math.max(this.bounds.max.z, worldPos.z);

    return true;
  }

  /**
   * Update voxel (merge with existing)
   */
  updateVoxel(coord: VoxelCoord, tsdf: number, weight: number): boolean {
    const existing = this.getVoxel(coord);

    if (existing) {
      // Weighted average
      const totalWeight = existing.weight + weight;
      if (totalWeight > this.config.maxWeight) {
        // Clamp weight
        const scale = this.config.maxWeight / totalWeight;
        existing.weight = this.config.maxWeight;
        existing.tsdf = (existing.tsdf * existing.weight + tsdf * weight * scale) / existing.weight;
      } else {
        existing.tsdf = (existing.tsdf * existing.weight + tsdf * weight) / totalWeight;
        existing.weight = totalWeight;
      }
      return true;
    } else {
      // Create new voxel
      return this.setVoxel(coord, { tsdf, weight });
    }
  }

  /**
   * Remove voxel
   */
  removeVoxel(coord: VoxelCoord): boolean {
    const key = this.hashCoord(coord);
    return this.voxels.delete(key);
  }

  /**
   * Get all voxels in region
   */
  getVoxelsInRegion(
    min: Vector3,
    max: Vector3
  ): Array<{ coord: VoxelCoord; voxel: Voxel }> {
    const minCoord = this.worldToVoxel(min);
    const maxCoord = this.worldToVoxel(max);

    const results: Array<{ coord: VoxelCoord; voxel: Voxel }> = [];

    for (let x = minCoord.x; x <= maxCoord.x; x++) {
      for (let y = minCoord.y; y <= maxCoord.y; y++) {
        for (let z = minCoord.z; z <= maxCoord.z; z++) {
          const coord = { x, y, z };
          const voxel = this.getVoxel(coord);
          if (voxel) {
            results.push({ coord, voxel });
          }
        }
      }
    }

    return results;
  }

  /**
   * Iterate over all voxels
   */
  forEach(callback: (coord: VoxelCoord, voxel: Voxel) => void): void {
    for (const [key, voxel] of this.voxels) {
      const coord = this.unhashCoord(key);
      callback(coord, voxel);
    }
  }

  /**
   * Get bounds of occupied voxels
   */
  getBounds(): { min: Vector3; max: Vector3 } {
    return {
      min: this.bounds.min.clone(),
      max: this.bounds.max.clone(),
    };
  }

  /**
   * Get voxel count
   */
  getVoxelCount(): number {
    return this.voxels.size;
  }

  /**
   * Get memory usage estimate (in MB)
   */
  getMemoryUsage(): number {
    // Each voxel: 8 bytes (tsdf + weight as Float32)
    // Hash map overhead: ~24 bytes per entry
    const bytesPerVoxel = 32;
    return (this.voxels.size * bytesPerVoxel) / (1024 * 1024);
  }

  /**
   * Clear all voxels
   */
  clear(): void {
    this.voxels.clear();
    this.bounds = {
      min: new Vector3(Infinity, Infinity, Infinity),
      max: new Vector3(-Infinity, -Infinity, -Infinity),
    };
  }

  /**
   * Remove voxels older than threshold
   */
  pruneOldVoxels(minWeight: number = 0.1): number {
    let removed = 0;

    for (const [key, voxel] of this.voxels) {
      if (voxel.weight < minWeight) {
        this.voxels.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      log.debug(`Pruned ${removed} voxels`);
    }

    return removed;
  }

  /**
   * Export voxels to array
   */
  toArray(): Array<{ position: Vector3; tsdf: number; weight: number }> {
    const result: Array<{ position: Vector3; tsdf: number; weight: number }> = [];

    this.forEach((coord, voxel) => {
      result.push({
        position: this.voxelToWorld(coord),
        tsdf: voxel.tsdf,
        weight: voxel.weight,
      });
    });

    return result;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<VoxelGridConfig> {
    return { ...this.config };
  }
}
