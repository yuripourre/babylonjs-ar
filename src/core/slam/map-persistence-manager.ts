/**
 * Map Persistence Manager
 * Handles map saving, loading, and storage management
 */

import type { SLAMConfig } from './types';
import { SLAMMapManager } from './slam-map';
import { MapStorage, type StoredMap } from './map-storage';
import { generateId } from '../../utils/id-generator';

/**
 * Map Persistence Manager
 * Responsible for map storage and retrieval
 */
export class MapPersistenceManager {
  private storage: MapStorage;
  private currentMapId: string | null = null;
  private lastSaveTime = 0;
  private autosaveTimer: Timer | null = null;

  constructor(
    private map: SLAMMapManager,
    private config: Required<SLAMConfig>
  ) {
    this.storage = new MapStorage({
      preferIndexedDB: true,
      enableCompression: true,
    });
  }

  /**
   * Initialize persistence (set up autosave if enabled)
   */
  async initialize(): Promise<void> {
    if (!this.config.enablePersistence) {
      console.warn('[MapPersistence] Persistence not enabled in config');
      return;
    }

    await this.storage.initialize();

    // Set up autosave
    if (this.config.autosaveInterval > 0) {
      this.setupAutosave();
    }

    console.log('[MapPersistence] Initialized');
  }

  /**
   * Save current map to storage
   *
   * @param name Optional map name
   * @param id Optional map ID (generates new one if not provided)
   * @returns Map ID
   */
  async saveMap(name?: string, id?: string): Promise<string> {
    // Generate ID if not provided
    const mapId = id ?? this.currentMapId ?? generateId();
    const mapName = name ?? this.map.getName() ?? `Map ${new Date().toISOString()}`;

    // Serialize map
    const serialized = this.map.serialize();

    // Check size limit
    const size = new Blob([JSON.stringify(serialized)]).size;
    if (size > this.config.maxMapSize) {
      throw new Error(
        `Map size (${size} bytes) exceeds limit (${this.config.maxMapSize} bytes)`
      );
    }

    // Save to storage
    await this.storage.save(mapId, mapName, serialized);

    this.currentMapId = mapId;
    this.lastSaveTime = Date.now();

    console.log(`[MapPersistence] Map saved: ${mapName} (${mapId}), size: ${size} bytes`);
    return mapId;
  }

  /**
   * Load map from storage
   *
   * @param id Map ID
   * @returns Loaded map
   */
  async loadMap(id: string): Promise<SLAMMapManager> {
    // Load from storage
    const serialized = await this.storage.load(id);
    if (!serialized) {
      throw new Error(`Map not found: ${id}`);
    }

    // Deserialize map
    const loadedMap = SLAMMapManager.deserialize(serialized);
    this.currentMapId = id;

    console.log(`[MapPersistence] Map loaded: ${id}`);
    return loadedMap;
  }

  /**
   * Delete map from storage
   *
   * @param id Map ID
   */
  async deleteMap(id: string): Promise<void> {
    await this.storage.delete(id);

    if (this.currentMapId === id) {
      this.currentMapId = null;
    }

    console.log(`[MapPersistence] Map deleted: ${id}`);
  }

  /**
   * List all stored maps
   *
   * @returns Array of map metadata
   */
  async listMaps(): Promise<
    Array<{ id: string; name: string; timestamp: number; size: number }>
  > {
    return await this.storage.list();
  }

  /**
   * Get storage statistics
   *
   * @returns Storage usage info
   */
  async getStorageStats(): Promise<{
    used: number;
    available: number;
    numMaps: number;
  }> {
    const stats = await this.storage.getStats();
    return {
      used: stats.totalSize,
      available: 0, // Not available from current storage API
      numMaps: stats.count,
    };
  }

  /**
   * Get current map ID
   */
  getCurrentMapId(): string | null {
    return this.currentMapId;
  }

  /**
   * Get last save timestamp
   */
  getLastSaveTime(): number {
    return this.lastSaveTime;
  }

  /**
   * Set up autosave timer
   */
  private setupAutosave(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }

    this.autosaveTimer = setInterval(
      () => this.autoSave(),
      this.config.autosaveInterval
    );

    console.log(
      `[MapPersistence] Autosave enabled (interval: ${this.config.autosaveInterval}ms)`
    );
  }

  /**
   * Perform autosave
   */
  private async autoSave(): Promise<void> {
    try {
      // Only autosave if map has keyframes
      const keyframes = this.map.getAllKeyframes();
      if (keyframes.length === 0) {
        return;
      }

      // Check if enough time has passed since last save
      const timeSinceLastSave = Date.now() - this.lastSaveTime;
      if (timeSinceLastSave < this.config.autosaveInterval) {
        return;
      }

      console.log('[MapPersistence] Performing autosave...');
      await this.saveMap();
    } catch (error) {
      console.error('[MapPersistence] Autosave failed:', error);
    }
  }

  /**
   * Stop autosave
   */
  stopAutosave(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
      console.log('[MapPersistence] Autosave stopped');
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopAutosave();
    console.log('[MapPersistence] Destroyed');
  }
}
