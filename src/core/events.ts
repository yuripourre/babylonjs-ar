/**
 * Type-Safe Event System
 * Provides strongly-typed event emitter with proper unsubscribe mechanism
 */

/**
 * Event listener function (exported for external use)
 */
export type EventListener<T extends unknown[] = unknown[]> = (...args: T) => void | Promise<void>;

/**
 * Event listener with metadata
 */
interface ListenerEntry<T extends unknown[] = unknown[]> {
  listener: (...args: T) => void;
  once: boolean;
}

/**
 * Type-safe event emitter
 *
 * @example
 * ```typescript
 * interface MyEvents {
 *   'data': [value: number];
 *   'error': [error: Error];
 *   'ready': [];
 * }
 *
 * class MyClass extends TypedEventEmitter<MyEvents> {
 *   start() {
 *     this.emit('ready');
 *     this.emit('data', 42);
 *   }
 * }
 * ```
 */
export class TypedEventEmitter<TEvents extends Record<string, unknown[]>> {
  private listeners = new Map<keyof TEvents, ListenerEntry<unknown[]>[]>();
  private maxListeners = 10;

  /**
   * Register event listener
   */
  on<K extends keyof TEvents>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this {
    return this.addListener(event, listener, false);
  }

  /**
   * Register one-time event listener
   */
  once<K extends keyof TEvents>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this {
    return this.addListener(event, listener, true);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof TEvents>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this {
    const listeners = this.listeners.get(event);
    if (!listeners) {
      return this;
    }

    const index = listeners.findIndex((entry) => entry.listener === (listener as any));
    if (index >= 0) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0) {
      this.listeners.delete(event);
    }

    return this;
  }

  /**
   * Remove all listeners for an event (or all events if not specified)
   */
  removeAllListeners<K extends keyof TEvents>(event?: K): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  /**
   * Emit event to all listeners
   */
  emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): boolean {
    const listeners = this.listeners.get(event);
    if (!listeners || listeners.length === 0) {
      return false;
    }

    // Create copy to avoid issues if listeners modify the array
    const listenersCopy = [...listeners];

    for (const entry of listenersCopy) {
      try {
        entry.listener(...args);

        // Remove if once
        if (entry.once) {
          this.off(event, entry.listener as (...args: TEvents[K]) => void);
        }
      } catch (error) {
        console.error(`Error in event listener for '${String(event)}':`, error);
      }
    }

    return true;
  }

  /**
   * Get listener count for event
   */
  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /**
   * Get all listeners for event
   */
  getListeners<K extends keyof TEvents>(event: K): Array<(...args: TEvents[K]) => void> {
    const listeners = this.listeners.get(event);
    if (!listeners) {
      return [];
    }
    return listeners.map((entry) => entry.listener as (...args: TEvents[K]) => void);
  }

  /**
   * Set max listeners per event (for memory leak detection)
   */
  setMaxListeners(n: number): this {
    this.maxListeners = n;
    return this;
  }

  /**
   * Get max listeners setting
   */
  getMaxListeners(): number {
    return this.maxListeners;
  }

  /**
   * Internal: Add listener with once flag
   */
  private addListener<K extends keyof TEvents>(
    event: K,
    listener: (...args: TEvents[K]) => void,
    once: boolean
  ): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const listeners = this.listeners.get(event)!;

    // Check max listeners
    if (listeners.length >= this.maxListeners) {
      console.warn(
        `Possible memory leak detected: ${listeners.length + 1} listeners for event '${String(event)}'`
      );
    }

    listeners.push({
      listener: listener as any,
      once,
    });

    return this;
  }
}

/**
 * AR System Events
 */
export interface AREvents {
  // Lifecycle
  'ready': [];
  'start': [];
  'stop': [];
  'destroy': [];

  // Frame
  'frame': [frame: ARFrame];
  'frame:before': [timestamp: number];
  'frame:after': [frame: ARFrame];

  // Markers
  'marker:detected': [marker: DetectedMarker];
  'marker:updated': [marker: DetectedMarker];
  'marker:lost': [id: number];

  // Planes
  'plane:detected': [plane: DetectedPlane];
  'plane:updated': [plane: DetectedPlane];
  'plane:removed': [id: string];

  // Depth
  'depth:available': [depthMap: DepthMap];
  'depth:updated': [depthMap: DepthMap];

  // Mesh
  'mesh:extracted': [mesh: ExtractedMesh];
  'mesh:updated': [mesh: ExtractedMesh];

  // Tracking
  'tracking:state': [state: TrackingState];
  'tracking:lost': [];
  'tracking:recovered': [];

  // XR
  'xr:session:start': [session: XRSession];
  'xr:session:end': [];
  'xr:pose:update': [pose: XRPoseData];

  // Performance
  'fps:change': [fps: number];
  'performance:warning': [metrics: PerformanceMetrics];

  // Errors
  'error': [error: ARError];
  'warning': [message: string];

  // Index signature for extensibility
  [key: string]: unknown[];
}

/**
 * Import types (defined elsewhere, just for type checking)
 */
import type { ARError } from './errors';

// Stub types for demonstration
interface ARFrame {
  timestamp: number;
  [key: string]: unknown;
}

interface DetectedMarker {
  id: number;
  [key: string]: unknown;
}

interface DetectedPlane {
  id: string;
  [key: string]: unknown;
}

interface DepthMap {
  width: number;
  height: number;
  [key: string]: unknown;
}

interface ExtractedMesh {
  vertices: unknown[];
  [key: string]: unknown;
}

type TrackingState = 'tracking' | 'lost' | 'limited';

interface XRSession {
  [key: string]: unknown;
}

interface XRPoseData {
  [key: string]: unknown;
}

interface PerformanceMetrics {
  fps: number;
  [key: string]: unknown;
}

/**
 * Event middleware system for filtering/transforming events
 */
export type EventMiddleware<TEvents extends Record<string, unknown[]>> = <
  K extends keyof TEvents
>(
  event: K,
  args: TEvents[K]
) => boolean | void; // Return false to prevent event

/**
 * Enhanced event emitter with middleware support
 */
export class EventEmitterWithMiddleware<
  TEvents extends Record<string, unknown[]>
> extends TypedEventEmitter<TEvents> {
  private middleware: EventMiddleware<TEvents>[] = [];

  /**
   * Add event middleware
   */
  use(middleware: EventMiddleware<TEvents>): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Emit with middleware processing
   */
  override emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): boolean {
    // Run through middleware
    for (const mw of this.middleware) {
      const result = mw(event, args);
      if (result === false) {
        return false; // Middleware blocked event
      }
    }

    return super.emit(event, ...args);
  }
}

/**
 * Utility: Wait for specific event
 */
export function waitForEvent<
  TEvents extends Record<string, unknown[]>,
  K extends keyof TEvents
>(
  emitter: TypedEventEmitter<TEvents>,
  event: K,
  timeout?: number
): Promise<TEvents[K]> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    const listener = (...args: TEvents[K]) => {
      cleanup();
      resolve(args);
    };

    emitter.once(event, listener);

    if (timeout) {
      timeoutId = setTimeout(() => {
        emitter.off(event, listener);
        reject(new Error(`Timeout waiting for event '${String(event)}'`));
      }, timeout);
    }
  });
}

/**
 * Utility: Event stream for async iteration
 */
export class EventStream<
  TEvents extends Record<string, unknown[]>,
  K extends keyof TEvents
> {
  private queue: TEvents[K][] = [];
  private resolvers: Array<(value: TEvents[K]) => void> = [];

  constructor(
    private emitter: TypedEventEmitter<TEvents>,
    private event: K
  ) {
    this.emitter.on(this.event, this.onEvent);
  }

  private onEvent = (...args: TEvents[K]): void => {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(args);
    } else {
      this.queue.push(args);
    }
  };

  async next(): Promise<TEvents[K]> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }

    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  [Symbol.asyncIterator]() {
    return {
      next: async () => {
        const value = await this.next();
        return { value, done: false };
      },
    };
  }

  destroy(): void {
    this.emitter.off(this.event, this.onEvent);
    this.queue = [];
    this.resolvers = [];
  }
}
