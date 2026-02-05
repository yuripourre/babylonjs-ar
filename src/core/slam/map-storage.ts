/**
 * Map Storage
 * Handles persistence of SLAM maps to browser storage
 * Supports IndexedDB (for large maps) and localStorage (for small maps)
 */

import type { SerializedMap } from './types';

export interface StorageConfig {
  // Preferred storage method
  preferIndexedDB?: boolean;

  // Database name for IndexedDB
  dbName?: string;

  // Object store name
  storeName?: string;

  // Maximum size for localStorage (bytes)
  maxLocalStorageSize?: number;

  // Enable compression
  enableCompression?: boolean;
}

export interface StoredMap {
  id: string;
  name: string;
  timestamp: number;
  version: string;
  size: number;
  compressed: boolean;
  data: SerializedMap | string; // string if compressed
}

export class MapStorage {
  private config: Required<StorageConfig>;
  private db: IDBDatabase | null = null;
  private readonly STORAGE_KEY_PREFIX = 'babylonjs-ar-map-';
  private readonly CURRENT_VERSION = '1.0';

  constructor(config: StorageConfig = {}) {
    this.config = {
      preferIndexedDB: config.preferIndexedDB ?? true,
      dbName: config.dbName ?? 'babylonjs-ar-maps',
      storeName: config.storeName ?? 'maps',
      maxLocalStorageSize: config.maxLocalStorageSize ?? 5 * 1024 * 1024, // 5MB
      enableCompression: config.enableCompression ?? true,
    };
  }

  /**
   * Initialize storage (opens IndexedDB if available)
   */
  async initialize(): Promise<void> {
    if (!this.config.preferIndexedDB) {
      console.log('[MapStorage] Using localStorage');
      return;
    }

    try {
      this.db = await this.openIndexedDB();
      console.log('[MapStorage] IndexedDB initialized');
    } catch (error) {
      console.warn('[MapStorage] IndexedDB unavailable, falling back to localStorage:', error);
      this.config.preferIndexedDB = false;
    }
  }

  /**
   * Save map to storage
   */
  async save(id: string, name: string, map: SerializedMap): Promise<void> {
    // Prepare stored map
    const jsonString = JSON.stringify(map);
    const size = new Blob([jsonString]).size;

    let data: SerializedMap | string = map;
    let compressed = false;

    // Compress if enabled and map is large
    if (this.config.enableCompression && size > 100 * 1024) { // > 100KB
      try {
        data = await this.compress(jsonString);
        compressed = true;
        console.log(`[MapStorage] Compressed map from ${size} to ${data.length} bytes`);
      } catch (error) {
        console.warn('[MapStorage] Compression failed, storing uncompressed:', error);
      }
    }

    const storedMap: StoredMap = {
      id,
      name,
      timestamp: Date.now(),
      version: this.CURRENT_VERSION,
      size,
      compressed,
      data,
    };

    // Store using IndexedDB or localStorage
    if (this.db && this.config.preferIndexedDB) {
      await this.saveToIndexedDB(storedMap);
    } else {
      await this.saveToLocalStorage(storedMap);
    }

    console.log(`[MapStorage] Saved map "${name}" (${id})`);
  }

  /**
   * Load map from storage
   */
  async load(id: string): Promise<SerializedMap | null> {
    let storedMap: StoredMap | null = null;

    // Load from IndexedDB or localStorage
    if (this.db && this.config.preferIndexedDB) {
      storedMap = await this.loadFromIndexedDB(id);
    } else {
      storedMap = await this.loadFromLocalStorage(id);
    }

    if (!storedMap) {
      console.warn(`[MapStorage] Map not found: ${id}`);
      return null;
    }

    // Validate version
    if (storedMap.version !== this.CURRENT_VERSION) {
      console.warn(`[MapStorage] Map version mismatch: ${storedMap.version} vs ${this.CURRENT_VERSION}`);
      // TODO: Implement version migration
    }

    // Decompress if needed
    let map: SerializedMap;
    if (storedMap.compressed && typeof storedMap.data === 'string') {
      const jsonString = await this.decompress(storedMap.data);
      map = JSON.parse(jsonString);
    } else {
      map = storedMap.data as SerializedMap;
    }

    console.log(`[MapStorage] Loaded map "${storedMap.name}" (${id})`);
    return map;
  }

  /**
   * Delete map from storage
   */
  async delete(id: string): Promise<void> {
    if (this.db && this.config.preferIndexedDB) {
      await this.deleteFromIndexedDB(id);
    } else {
      await this.deleteFromLocalStorage(id);
    }

    console.log(`[MapStorage] Deleted map: ${id}`);
  }

  /**
   * List all stored maps
   */
  async list(): Promise<Array<Omit<StoredMap, 'data'>>> {
    if (this.db && this.config.preferIndexedDB) {
      return await this.listFromIndexedDB();
    } else {
      return await this.listFromLocalStorage();
    }
  }

  /**
   * Clear all stored maps
   */
  async clear(): Promise<void> {
    if (this.db && this.config.preferIndexedDB) {
      await this.clearIndexedDB();
    } else {
      await this.clearLocalStorage();
    }

    console.log('[MapStorage] Cleared all maps');
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    count: number;
    totalSize: number;
    storageType: 'indexeddb' | 'localstorage';
  }> {
    const maps = await this.list();
    const totalSize = maps.reduce((sum, map) => sum + map.size, 0);

    return {
      count: maps.length,
      totalSize,
      storageType: this.db && this.config.preferIndexedDB ? 'indexeddb' : 'localstorage',
    };
  }

  /**
   * Close storage (cleanup)
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ==================== Private Methods ====================

  /**
   * Open IndexedDB
   */
  private openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          db.createObjectStore(this.config.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Save to IndexedDB
   */
  private saveToIndexedDB(map: StoredMap): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.put(map);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Load from IndexedDB
   */
  private loadFromIndexedDB(id: string): Promise<StoredMap | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * Delete from IndexedDB
   */
  private deleteFromIndexedDB(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * List from IndexedDB
   */
  private listFromIndexedDB(): Promise<Array<Omit<StoredMap, 'data'>>> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.getAllKeys();

      request.onerror = () => reject(request.error);
      request.onsuccess = async () => {
        const keys = request.result as string[];
        const maps: Array<Omit<StoredMap, 'data'>> = [];

        for (const key of keys) {
          const map = await this.loadFromIndexedDB(key);
          if (map) {
            const { data, ...metadata } = map;
            maps.push(metadata);
          }
        }

        resolve(maps);
      };
    });
  }

  /**
   * Clear IndexedDB
   */
  private clearIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Save to localStorage
   */
  private async saveToLocalStorage(map: StoredMap): Promise<void> {
    const key = this.STORAGE_KEY_PREFIX + map.id;
    const data = JSON.stringify(map);

    if (data.length > this.config.maxLocalStorageSize) {
      throw new Error(`Map too large for localStorage: ${data.length} bytes`);
    }

    try {
      localStorage.setItem(key, data);
    } catch (error) {
      throw new Error(`Failed to save to localStorage: ${error}`);
    }
  }

  /**
   * Load from localStorage
   */
  private async loadFromLocalStorage(id: string): Promise<StoredMap | null> {
    const key = this.STORAGE_KEY_PREFIX + id;
    const data = localStorage.getItem(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('[MapStorage] Failed to parse localStorage data:', error);
      return null;
    }
  }

  /**
   * Delete from localStorage
   */
  private async deleteFromLocalStorage(id: string): Promise<void> {
    const key = this.STORAGE_KEY_PREFIX + id;
    localStorage.removeItem(key);
  }

  /**
   * List from localStorage
   */
  private async listFromLocalStorage(): Promise<Array<Omit<StoredMap, 'data'>>> {
    const maps: Array<Omit<StoredMap, 'data'>> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_KEY_PREFIX)) {
        const id = key.substring(this.STORAGE_KEY_PREFIX.length);
        const map = await this.loadFromLocalStorage(id);
        if (map) {
          const { data, ...metadata } = map;
          maps.push(metadata);
        }
      }
    }

    return maps;
  }

  /**
   * Clear localStorage
   */
  private async clearLocalStorage(): Promise<void> {
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_KEY_PREFIX)) {
        keys.push(key);
      }
    }

    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }

  /**
   * Compress data using gzip (CompressionStream API)
   */
  private async compress(data: string): Promise<string> {
    // Check if CompressionStream is available
    if (typeof CompressionStream === 'undefined') {
      throw new Error('CompressionStream not supported');
    }

    const stream = new Blob([data]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(compressedStream).blob();
    const buffer = await compressedBlob.arrayBuffer();

    // Convert to base64
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  /**
   * Decompress data using gzip (DecompressionStream API)
   */
  private async decompress(data: string): Promise<string> {
    // Check if DecompressionStream is available
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream not supported');
    }

    // Convert from base64
    const binaryString = atob(data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const stream = new Blob([bytes]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const decompressedBlob = await new Response(decompressedStream).blob();

    return await decompressedBlob.text();
  }
}
