/**
 * React Hooks for AR Engine
 * Easy integration with React applications (V2 - Plugin-based)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AREngine, type AREngineConfig } from '../../core/engine';
import { MarkerTrackingPlugin, type MarkerTrackingConfig } from '../../plugins/marker-tracking-plugin';
import { type TrackedMarker } from '../../core/tracking/tracker';
import type { DetectedPlane } from '../../core/detection/plane-detector';
import type { ARError } from '../../core/errors';

/* eslint-disable no-unused-vars */
export interface UseAROptions {
  arConfig?: AREngineConfig;
  markerTracking?: MarkerTrackingConfig;
  planeDetection?: boolean;
  autoStart?: boolean;
  onFrame?: (frame: unknown) => void;
  onMarkerDetected?: (marker: TrackedMarker) => void;
  onPlaneDetected?: (plane: DetectedPlane) => void;
  onError?: (error: ARError) => void;
}
/* eslint-enable no-unused-vars */

export interface UseARResult {
  engine: AREngine | null;
  isInitialized: boolean;
  isRunning: boolean;
  error: ARError | null;
  fps: number;
  markers: TrackedMarker[];
  planes: DetectedPlane[];
  start: () => Promise<void>;
  stop: () => void;
  restart: () => Promise<void>;
}

/**
 * React hook for AR Engine (V2 - Plugin-based)
 *
 * @example
 * ```tsx
 * function ARComponent() {
 *   const { isInitialized, markers, fps } = useAR({
 *     markerTracking: { dictionary: 'ARUCO_4X4_50' },
 *     onMarkerDetected: (marker) => console.log('Found:', marker.id)
 *   });
 *
 *   return (
 *     <div>
 *       <p>FPS: {fps}</p>
 *       <p>Markers: {markers.length}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAR(options: UseAROptions = {}): UseARResult {
  const engineRef = useRef<AREngine | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<ARError | null>(null);
  const [fps, setFPS] = useState(0);
  const [markers, setMarkers] = useState<TrackedMarker[]>([]);
  const [planes, setPlanes] = useState<DetectedPlane[]>([]);

  // Initialize engine
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        // Create AR engine
        const engine = new AREngine();

        // Add plugins
        if (options.markerTracking) {
          engine.use(new MarkerTrackingPlugin(options.markerTracking));
        }

        // Setup event listeners
        engine.on('frame', (frame) => {
          if (!mounted) {
            return;
          }

          // Update markers and planes
          if (frame.markers) {
            setMarkers(frame.markers as TrackedMarker[]);
          }
          if (frame.planes) {
            setPlanes(frame.planes as DetectedPlane[]);
          }

          // Call user callback
          if (options.onFrame) {
            options.onFrame(frame);
          }
        });

        engine.on('fps:change', (newFps) => {
          if (!mounted) {
            return;
          }
          setFPS(newFps);
        });

        if (options.onMarkerDetected) {
          engine.on('marker:detected', (marker) => {
            if (!mounted) {
              return;
            }
            const callback = options.onMarkerDetected;
            if (callback) {
              callback(marker);
            }
          });
        }

        if (options.onPlaneDetected) {
          engine.on('plane:detected', (plane) => {
            if (!mounted) {
              return;
            }
            const callback = options.onPlaneDetected;
            if (callback) {
              callback(plane);
            }
          });
        }

        engine.on('error', (err) => {
          if (!mounted) {
            return;
          }
          setError(err);
          if (options.onError) {
            options.onError(err);
          }
        });

        // Initialize
        await engine.initialize(options.arConfig);

        if (mounted) {
          engineRef.current = engine;
          setIsInitialized(true);

          // Auto-start if requested
          if (options.autoStart !== false) {
            await engine.start();
            setIsRunning(true);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err as ARError);
          if (options.onError) {
            options.onError(err as ARError);
          }
        }
      }
    }

    init();

    // Cleanup
    return () => {
      mounted = false;
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  const start = useCallback(async () => {
    if (engineRef.current && !isRunning) {
      await engineRef.current.start();
      setIsRunning(true);
    }
  }, [isRunning]);

  const stop = useCallback(() => {
    if (engineRef.current && isRunning) {
      engineRef.current.stop();
      setIsRunning(false);
    }
  }, [isRunning]);

  const restart = useCallback(async () => {
    if (engineRef.current) {
      await engineRef.current.destroy();
    }
    setIsInitialized(false);
    setIsRunning(false);
    setError(null);
    setMarkers([]);
    setPlanes([]);
    // Note: Re-initialization would need a state toggle
  }, []);

  return {
    engine: engineRef.current,
    isInitialized,
    isRunning,
    error,
    fps,
    markers,
    planes,
    start,
    stop,
    restart,
  };
}

/**
 * Hook for marker tracking only
 */
/* eslint-disable no-unused-vars */
export function useMarkerTracking(options: {
  markerConfig?: MarkerTrackingConfig;
  onMarkerDetected?: (marker: TrackedMarker) => void;
  onMarkerLost?: (markerId: number) => void;
} = {}) {
/* eslint-enable no-unused-vars */
  const ar = useAR({
    markerTracking: options.markerConfig || {},
    onMarkerDetected: options.onMarkerDetected,
  });

  // Setup marker lost listener
  useEffect(() => {
    if (ar.engine && options.onMarkerLost) {
      const callback = options.onMarkerLost;
      ar.engine.on('marker:lost', callback);
      return () => {
        if (ar.engine && callback) {
          ar.engine.off('marker:lost', callback);
        }
      };
    }
  }, [ar.engine, options.onMarkerLost]);

  return ar;
}

/**
 * Hook for plane detection only
 */
/* eslint-disable no-unused-vars */
export function usePlaneDetection(options: {
  onPlaneDetected?: (plane: DetectedPlane) => void;
} = {}) {
/* eslint-enable no-unused-vars */
  return useAR({
    planeDetection: true,
    onPlaneDetected: options.onPlaneDetected,
  });
}
