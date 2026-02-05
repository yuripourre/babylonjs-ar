/**
 * Plugin System
 * Extensible architecture for adding features to AR engine
 */

import { TypedEventEmitter } from './events';
import { ARError, ErrorCodes } from './errors';
import type { ARFrame } from './engine';

/**
 * AR Context provided to plugins
 */
export interface ARContext {
  /** GPU device */
  gpu: GPUDevice;

  /** GPU context manager (for legacy classes) */
  gpuContext?: any;

  /** Camera manager */
  camera: {
    getFrame(): Promise<VideoFrame | HTMLVideoElement>;
    getIntrinsics(): CameraIntrinsics;
  };

  /** Event emitter */
  events: TypedEventEmitter<any>;

  /** Configuration */
  config: Record<string, unknown>;

  /** Shared state between plugins */
  state: Map<string, unknown>;
}

/**
 * Camera intrinsics
 */
export interface CameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/**
 * Plugin lifecycle hook result
 */
export type HookResult = void | Promise<void>;

/**
 * Plugin interface
 */
export interface ARPlugin {
  /** Unique plugin name */
  readonly name: string;

  /** Plugin version */
  readonly version?: string;

  /** Plugin priority (lower runs first) */
  readonly priority?: number;

  /** Plugin dependencies (names of required plugins) */
  readonly dependencies?: string[];

  /**
   * Initialize plugin
   * Called once when plugin is registered
   */
  initialize(context: ARContext): HookResult;

  /**
   * Process frame
   * Called every frame in priority order
   */
  processFrame?(frame: ARFrame, context: ARContext): HookResult;

  /**
   * Destroy plugin
   * Called when plugin is unregistered or engine is destroyed
   */
  destroy?(context: ARContext): HookResult;

  /**
   * Optional configuration validation
   */
  validateConfig?(config: unknown): boolean;
}

/**
 * Plugin registration info
 */
interface RegisteredPlugin {
  plugin: ARPlugin;
  initialized: boolean;
  priority: number;
}

/**
 * Plugin manager
 */
export class PluginManager {
  private plugins = new Map<string, RegisteredPlugin>();
  private initializationOrder: string[] = [];
  private isInitialized = false;

  /**
   * Register a plugin
   */
  register(plugin: ARPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new ARError(
        `Plugin '${plugin.name}' is already registered`,
        ErrorCodes.PLUGIN_ALREADY_REGISTERED,
        {
          context: { pluginName: plugin.name },
        }
      );
    }

    const priority = plugin.priority ?? 100;

    this.plugins.set(plugin.name, {
      plugin,
      initialized: false,
      priority,
    });
  }

  /**
   * Unregister a plugin
   */
  async unregister(name: string, context: ARContext): Promise<void> {
    const registered = this.plugins.get(name);
    if (!registered) {
      return;
    }

    // Call destroy if plugin was initialized
    if (registered.initialized && registered.plugin.destroy) {
      await registered.plugin.destroy(context);
    }

    this.plugins.delete(name);

    // Remove from initialization order
    const index = this.initializationOrder.indexOf(name);
    if (index >= 0) {
      this.initializationOrder.splice(index, 1);
    }
  }

  /**
   * Get plugin by name
   */
  get(name: string): ARPlugin | undefined {
    return this.plugins.get(name)?.plugin;
  }

  /**
   * Check if plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all registered plugin names
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Initialize all plugins
   * Respects dependencies and priority order
   */
  async initialize(context: ARContext): Promise<void> {
    if (this.isInitialized) {
      throw new ARError(
        'PluginManager already initialized',
        ErrorCodes.ALREADY_INITIALIZED
      );
    }

    // Resolve initialization order (topological sort)
    this.initializationOrder = this.resolveInitializationOrder();

    // Initialize plugins in order
    for (const name of this.initializationOrder) {
      const registered = this.plugins.get(name)!;

      try {
        await registered.plugin.initialize(context);
        registered.initialized = true;
      } catch (error) {
        throw new ARError(
          `Failed to initialize plugin '${name}'`,
          ErrorCodes.PLUGIN_INITIALIZATION_FAILED,
          {
            context: { pluginName: name },
            cause: error instanceof Error ? error : undefined,
          }
        );
      }
    }

    this.isInitialized = true;
  }

  /**
   * Process frame through all plugins
   */
  async processFrame(frame: ARFrame, context: ARContext): Promise<void> {
    if (!this.isInitialized) {
      throw new ARError(
        'PluginManager not initialized',
        ErrorCodes.NOT_INITIALIZED
      );
    }

    for (const name of this.initializationOrder) {
      const registered = this.plugins.get(name)!;

      if (registered.plugin.processFrame) {
        try {
          await registered.plugin.processFrame(frame, context);
        } catch (error) {
          console.error(`Error in plugin '${name}' processFrame:`, error);
          // Continue processing other plugins
        }
      }
    }
  }

  /**
   * Destroy all plugins
   */
  async destroy(context: ARContext): Promise<void> {
    // Destroy in reverse order
    const destroyOrder = [...this.initializationOrder].reverse();

    for (const name of destroyOrder) {
      const registered = this.plugins.get(name);
      if (registered?.initialized && registered.plugin.destroy) {
        try {
          await registered.plugin.destroy(context);
        } catch (error) {
          console.error(`Error destroying plugin '${name}':`, error);
        }
      }
    }

    this.plugins.clear();
    this.initializationOrder = [];
    this.isInitialized = false;
  }

  /**
   * Resolve plugin initialization order using topological sort
   */
  private resolveInitializationOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (name: string, path: Set<string> = new Set()) => {
      if (visited.has(name)) {
        return;
      }

      if (path.has(name)) {
        throw new ARError(
          `Circular dependency detected in plugins: ${Array.from(path).join(' -> ')} -> ${name}`,
          ErrorCodes.INVALID_CONFIGURATION
        );
      }

      const registered = this.plugins.get(name);
      if (!registered) {
        throw new ARError(
          `Plugin '${name}' not found`,
          ErrorCodes.PLUGIN_NOT_FOUND,
          {
            context: { pluginName: name },
          }
        );
      }

      path.add(name);

      // Visit dependencies first
      if (registered.plugin.dependencies) {
        for (const dep of registered.plugin.dependencies) {
          if (!this.plugins.has(dep)) {
            throw new ARError(
              `Plugin '${name}' depends on '${dep}' which is not registered`,
              ErrorCodes.PLUGIN_NOT_FOUND,
              {
                context: { pluginName: name, dependency: dep },
              }
            );
          }
          visit(dep, path);
        }
      }

      path.delete(name);
      visited.add(name);
      order.push(name);
    };

    // Sort by priority then visit
    const pluginNames = Array.from(this.plugins.entries())
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([name]) => name);

    for (const name of pluginNames) {
      visit(name);
    }

    return order;
  }

  /**
   * Get plugin statistics
   */
  getStats(): {
    totalPlugins: number;
    initializedPlugins: number;
    plugins: Array<{ name: string; initialized: boolean; priority: number }>;
  } {
    const plugins = Array.from(this.plugins.entries()).map(([name, reg]) => ({
      name,
      initialized: reg.initialized,
      priority: reg.priority,
    }));

    return {
      totalPlugins: this.plugins.size,
      initializedPlugins: plugins.filter((p) => p.initialized).length,
      plugins,
    };
  }
}

/**
 * Base plugin class with common functionality
 */
export abstract class BaseARPlugin implements ARPlugin {
  abstract readonly name: string;
  public readonly version?: string;
  public readonly priority?: number;
  public readonly dependencies?: string[];

  protected context?: ARContext;
  protected enabled = true;

  async initialize(context: ARContext): Promise<void> {
    this.context = context;
    await this.onInitialize(context);
  }

  async destroy(context: ARContext): Promise<void> {
    await this.onDestroy(context);
    this.context = undefined;
  }

  /**
   * Enable/disable plugin processing
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Lifecycle hooks to implement
   */
  protected abstract onInitialize(context: ARContext): HookResult;
  protected abstract onDestroy(context: ARContext): HookResult;
}

/**
 * Plugin decorator for automatic registration
 */
export function ARPluginDecorator(config: {
  name: string;
  priority?: number;
  dependencies?: string[];
}) {
  return function <T extends new (...args: any[]) => ARPlugin>(
    target: T
  ): T {
    return class extends target {
      readonly name = config.name;
      readonly priority = config.priority;
      readonly dependencies = config.dependencies;
    };
  };
}
