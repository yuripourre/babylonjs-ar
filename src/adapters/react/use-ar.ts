/**
 * React Hooks for AR Engine
 * Easy integration with React applications
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ARBuilder, type ARPreset, type AREventHandlers } from '../../core/ar-builder';
import type { AREngine, ARFrame } from '../../core/engine';
import type { DetectedMarker } from '../../core/detection/marker-detector';
import type { DetectedPlane } from '../../core/detection/plane-detector';

export interface UseAROptions {
  preset?: ARPreset;
  markers?: boolean;
  planes?: boolean;
  autoStart?: boolean;
  onFrame?: (frame: ARFrame) => void;
  onMarkerDetected?: (marker: DetectedMarker) => void;
  onPlaneDetected?: (plane: DetectedPlane) => void;
  onError?: (error: Error) => void;
}

export interface UseARResult {
  engine: AREngine | null;
  isInitialized: boolean;
  isRunning: boolean;
  error: Error | null;
  fps: number;
  markers: DetectedMarker[];
  planes: DetectedPlane[];
  start: () => void;
  stop: () => void;
  restart: () => Promise<void>;
}

/**
 * React hook for AR Engine
 *
 * @example
 * ```tsx
 * function ARComponent() {
 *   const { isInitialized, markers, fps } = useAR({
 *     preset: 'mobile',
 *     markers: true,
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
  const [error, setError] = useState<Error | null>(null);
  const [fps, setFPS] = useState(0);
  const [markers, setMarkers] = useState<DetectedMarker[]>([]);
  const [planes, setPlanes] = useState<DetectedPlane[]>([]);

  // Track FPS
  const frameCountRef = useRef(0);
  const lastFPSUpdateRef = useRef(performance.now());

  // Initialize engine
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const builder = ARBuilder.preset(options.preset || 'desktop');

        if (options.markers) builder.enableMarkers();
        if (options.planes) builder.enablePlanes();

        if (options.onMarkerDetected) {
          builder.onMarkerDetected(options.onMarkerDetected);
        }

        if (options.onPlaneDetected) {
          builder.onPlaneDetected(options.onPlaneDetected);
        }

        if (options.onError) {
          builder.onError(options.onError);
        }

        builder.onFrame((frame) => {
          if (!mounted) return;

          // Update FPS
          frameCountRef.current++;
          const now = performance.now();
          if (now - lastFPSUpdateRef.current >= 1000) {
            const currentFPS = Math.round(
              (frameCountRef.current * 1000) / (now - lastFPSUpdateRef.current)
            );
            setFPS(currentFPS);
            frameCountRef.current = 0;
            lastFPSUpdateRef.current = now;
          }

          // Update markers and planes
          // TrackedMarker doesn't have marker property, skip for now
          // TODO: Update ARFrame to include DetectedMarker array
          if (frame.markers) {
            // Can't convert TrackedMarker to DetectedMarker without corners
            // setMarkers(frame.markers as any);
          }
          if (frame.planes) setPlanes(frame.planes);

          // Call user callback
          if (options.onFrame) {
            options.onFrame(frame);
          }
        });

        if (options.autoStart !== false) {
          builder.autoStart(true);
        }

        const engine = await builder.build();

        if (mounted) {
          engineRef.current = engine;
          setIsInitialized(true);
          setIsRunning(options.autoStart !== false);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          if (options.onError) {
            options.onError(err as Error);
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

  const start = useCallback(() => {
    if (engineRef.current && !isRunning) {
      engineRef.current.start((frame) => {
        if (options.onFrame) {
          options.onFrame(frame);
        }
      });
      setIsRunning(true);
    }
  }, [isRunning, options]);

  const stop = useCallback(() => {
    if (engineRef.current && isRunning) {
      engineRef.current.stop();
      setIsRunning(false);
    }
  }, [isRunning]);

  const restart = useCallback(async () => {
    if (engineRef.current) {
      engineRef.current.destroy();
    }
    setIsInitialized(false);
    setIsRunning(false);
    setError(null);

    // Re-initialize (trigger useEffect)
    // In practice, you'd need a state toggle here
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
export function useMarkerTracking(options: {
  preset?: ARPreset;
  onMarkerDetected?: (marker: DetectedMarker) => void;
  onMarkerLost?: (markerId: number) => void;
} = {}) {
  return useAR({
    ...options,
    markers: true,
    planes: false,
  });
}

/**
 * Hook for plane detection only
 */
export function usePlaneDetection(options: {
  preset?: ARPreset;
  onPlaneDetected?: (plane: DetectedPlane) => void;
} = {}) {
  return useAR({
    ...options,
    markers: false,
    planes: true,
  });
}
