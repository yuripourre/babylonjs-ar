/**
 * GPU Resource Manager
 * Tracks and manages lifecycle of GPU resources to prevent memory leaks
 */

import type {
  RenderTexture,
  RenderBuffer,
  RenderShader,
  RenderPipeline,
  RenderBindGroup,
  RenderBindGroupLayout,
} from '../renderer/backend';
import { Logger } from '../../utils/logger';

/**
 * Resource types that can be tracked
 */
export type GPUResource =
  | RenderTexture
  | RenderBuffer
  | RenderShader
  | RenderPipeline
  | RenderBindGroup
  | RenderBindGroupLayout;

/**
 * Resource metadata for tracking
 */
export interface ResourceMetadata {
  id: string;
  type: string;
  label?: string;
  size?: number;
  createdAt: number;
  destroyedAt?: number;
}

/**
 * Resource statistics
 */
export interface ResourceStats {
  totalResources: number;
  activeResources: number;
  destroyedResources: number;
  textureCount: number;
  bufferCount: number;
  pipelineCount: number;
  shaderCount: number;
  bindGroupCount: number;
  bindGroupLayoutCount: number;
  totalMemoryBytes: number;
}

/**
 * Resource group for batch operations
 */
export class ResourceGroup {
  private resources = new Set<GPUResource>();
  private destroyed = false;

  constructor(private name: string, private manager: ResourceManager) {}

  /**
   * Add a resource to this group
   */
  add(resource: GPUResource): void {
    if (this.destroyed) {
      throw new Error(`Cannot add resource to destroyed group: ${this.name}`);
    }
    this.resources.add(resource);
  }

  /**
   * Remove a resource from this group
   */
  remove(resource: GPUResource): void {
    this.resources.delete(resource);
  }

  /**
   * Destroy all resources in this group
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }

    for (const resource of this.resources) {
      this.manager.destroy(resource);
    }

    this.resources.clear();
    this.destroyed = true;
  }

  /**
   * Get number of resources in group
   */
  size(): number {
    return this.resources.size;
  }

  /**
   * Check if group is destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }
}

/**
 * GPU Resource Manager
 * Centralized tracking and management of GPU resources
 */
export class ResourceManager {
  private logger = Logger.create('ResourceManager');
  private resources = new WeakMap<GPUResource, ResourceMetadata>();
  private resourcesByType = new Map<string, Set<GPUResource>>();
  private groups = new Map<string, ResourceGroup>();
  private nextId = 1;
  private enabled = true;

  constructor() {
    this.logger.info('Resource manager initialized');
  }

  /**
   * Track a new resource
   */
  track(resource: GPUResource, type: string, label?: string, size?: number): void {
    if (!this.enabled) {
      return;
    }

    const metadata: ResourceMetadata = {
      id: `${type}-${this.nextId++}`,
      type,
      label,
      size,
      createdAt: Date.now(),
    };

    this.resources.set(resource, metadata);

    // Track by type
    if (!this.resourcesByType.has(type)) {
      this.resourcesByType.set(type, new Set());
    }
    this.resourcesByType.get(type)!.add(resource);

    this.logger.debug(`Tracked ${type}: ${metadata.id}`, { label, size });
  }

  /**
   * Destroy a resource and clean up tracking
   */
  destroy(resource: GPUResource): void {
    if (!this.enabled) {
      // Still destroy even if tracking is disabled
      this.destroyResource(resource);
      return;
    }

    const metadata = this.resources.get(resource);
    if (!metadata) {
      this.logger.warn('Attempted to destroy untracked resource');
      this.destroyResource(resource);
      return;
    }

    // Mark as destroyed
    metadata.destroyedAt = Date.now();

    // Remove from type tracking
    const typeSet = this.resourcesByType.get(metadata.type);
    if (typeSet) {
      typeSet.delete(resource);
    }

    // Destroy the actual resource
    this.destroyResource(resource);

    this.logger.debug(`Destroyed ${metadata.type}: ${metadata.id}`);
  }

  /**
   * Destroy the actual GPU resource
   */
  private destroyResource(resource: GPUResource): void {
    try {
      if ('destroy' in resource && typeof resource.destroy === 'function') {
        resource.destroy();
      }
    } catch (error) {
      this.logger.error('Failed to destroy resource', error);
    }
  }

  /**
   * Create a resource group for batch management
   */
  createGroup(name: string): ResourceGroup {
    if (this.groups.has(name)) {
      this.logger.warn(`Resource group '${name}' already exists`);
      return this.groups.get(name)!;
    }

    const group = new ResourceGroup(name, this);
    this.groups.set(name, group);
    this.logger.debug(`Created resource group: ${name}`);
    return group;
  }

  /**
   * Get an existing resource group
   */
  getGroup(name: string): ResourceGroup | undefined {
    return this.groups.get(name);
  }

  /**
   * Destroy a resource group
   */
  destroyGroup(name: string): void {
    const group = this.groups.get(name);
    if (group) {
      group.destroy();
      this.groups.delete(name);
      this.logger.debug(`Destroyed resource group: ${name}`);
    }
  }

  /**
   * Destroy all resources of a specific type
   */
  destroyByType(type: string): void {
    const resources = this.resourcesByType.get(type);
    if (!resources) {
      return;
    }

    const count = resources.size;
    for (const resource of Array.from(resources)) {
      this.destroy(resource);
    }

    this.logger.info(`Destroyed ${count} ${type} resources`);
  }

  /**
   * Destroy all tracked resources
   */
  destroyAll(): void {
    const types = Array.from(this.resourcesByType.keys());
    let totalCount = 0;

    for (const type of types) {
      const resources = this.resourcesByType.get(type);
      if (resources) {
        totalCount += resources.size;
        for (const resource of Array.from(resources)) {
          this.destroy(resource);
        }
      }
    }

    // Destroy all groups
    for (const [name, group] of this.groups) {
      if (!group.isDestroyed()) {
        group.destroy();
      }
    }
    this.groups.clear();

    this.logger.info(`Destroyed all resources (${totalCount} total)`);
  }

  /**
   * Get resource statistics
   */
  getStats(): ResourceStats {
    let totalResources = 0;
    let activeResources = 0;
    let destroyedResources = 0;
    let totalMemoryBytes = 0;

    const textureCount = this.resourcesByType.get('texture')?.size ?? 0;
    const bufferCount = this.resourcesByType.get('buffer')?.size ?? 0;
    const pipelineCount = this.resourcesByType.get('pipeline')?.size ?? 0;
    const shaderCount = this.resourcesByType.get('shader')?.size ?? 0;
    const bindGroupCount = this.resourcesByType.get('bindgroup')?.size ?? 0;
    const bindGroupLayoutCount = this.resourcesByType.get('bindgrouplayout')?.size ?? 0;

    for (const resources of this.resourcesByType.values()) {
      for (const resource of resources) {
        totalResources++;
        const metadata = this.resources.get(resource);
        if (metadata) {
          if (metadata.destroyedAt) {
            destroyedResources++;
          } else {
            activeResources++;
            if (metadata.size) {
              totalMemoryBytes += metadata.size;
            }
          }
        }
      }
    }

    return {
      totalResources,
      activeResources,
      destroyedResources,
      textureCount,
      bufferCount,
      pipelineCount,
      shaderCount,
      bindGroupCount,
      bindGroupLayoutCount,
      totalMemoryBytes,
    };
  }

  /**
   * Get metadata for a specific resource
   */
  getMetadata(resource: GPUResource): ResourceMetadata | undefined {
    return this.resources.get(resource);
  }

  /**
   * Check if a resource is tracked
   */
  isTracked(resource: GPUResource): boolean {
    return this.resources.has(resource);
  }

  /**
   * Enable resource tracking
   */
  enable(): void {
    this.enabled = true;
    this.logger.info('Resource tracking enabled');
  }

  /**
   * Disable resource tracking (resources still destroyed)
   */
  disable(): void {
    this.enabled = false;
    this.logger.info('Resource tracking disabled');
  }

  /**
   * Check if tracking is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Find leaks - resources created but not destroyed within a time window
   */
  findLeaks(maxAgeMs: number = 60000): ResourceMetadata[] {
    const now = Date.now();
    const leaks: ResourceMetadata[] = [];

    for (const resources of this.resourcesByType.values()) {
      for (const resource of resources) {
        const metadata = this.resources.get(resource);
        if (metadata && !metadata.destroyedAt) {
          const age = now - metadata.createdAt;
          if (age > maxAgeMs) {
            leaks.push(metadata);
          }
        }
      }
    }

    if (leaks.length > 0) {
      this.logger.warn(`Found ${leaks.length} potential resource leaks`, {
        maxAgeMs,
        leaks: leaks.map(l => ({ id: l.id, type: l.type, age: now - l.createdAt })),
      });
    }

    return leaks;
  }

  /**
   * Print resource statistics to console
   */
  printStats(): void {
    const stats = this.getStats();
    this.logger.info('Resource statistics', stats);
  }
}

/**
 * Global resource manager instance
 */
export const globalResourceManager = new ResourceManager();
