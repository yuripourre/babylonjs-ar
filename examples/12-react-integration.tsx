/**
 * React Integration Example for BabylonJS AR V2
 *
 * This example demonstrates how to use the useAR hook for marker tracking
 * in a React application.
 *
 * Installation:
 * npm install babylonjs-ar react react-dom @types/react @types/react-dom
 *
 * Usage:
 * import { ARComponent } from './12-react-integration';
 *
 * <ARComponent />
 */

import React from 'react';
import { useAR, useMarkerTracking } from '../dist/adapters/react/use-ar';
import type { TrackedMarker } from '../dist/core/tracking/tracker';

/**
 * Basic AR Component using useAR hook
 */
export function BasicARComponent() {
  const {
    isInitialized,
    isRunning,
    fps,
    markers,
    error,
    start,
    stop,
  } = useAR({
    markerTracking: {
      dictionary: 'ARUCO_4X4_50',
      markerSize: 0.1,
    },
    onMarkerDetected: (marker: TrackedMarker) => {
      console.log(`Marker detected: ${marker.id}`);
    },
    autoStart: true,
  });

  return (
    <div style={{
      padding: '20px',
      fontFamily: 'system-ui',
      background: '#1a1a1a',
      color: 'white',
      minHeight: '100vh',
    }}>
      <h1 style={{ color: '#00d9ff', marginBottom: '20px' }}>
        🎯 React AR Integration (V2)
      </h1>

      <div style={{
        background: 'rgba(0,0,0,0.5)',
        padding: '20px',
        borderRadius: '10px',
        marginBottom: '20px',
      }}>
        <h2 style={{ fontSize: '16px', marginBottom: '15px' }}>Status</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <strong>Initialized:</strong> {isInitialized ? '✅ Yes' : '❌ No'}
          </div>
          <div>
            <strong>Running:</strong> {isRunning ? '✅ Yes' : '❌ No'}
          </div>
          <div>
            <strong>FPS:</strong> {fps}
          </div>
          <div>
            <strong>Markers:</strong> {markers.length}
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(255,0,0,0.2)',
            border: '1px solid #ff0000',
            borderRadius: '5px',
          }}>
            <strong>Error:</strong> {error.message}
          </div>
        )}
      </div>

      <div style={{
        background: 'rgba(0,0,0,0.5)',
        padding: '20px',
        borderRadius: '10px',
        marginBottom: '20px',
      }}>
        <h2 style={{ fontSize: '16px', marginBottom: '15px' }}>Detected Markers</h2>
        {markers.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No markers detected yet...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {markers.map((marker) => (
              <div
                key={marker.id}
                style={{
                  padding: '10px',
                  background: 'rgba(0,217,255,0.1)',
                  border: '1px solid #00d9ff',
                  borderRadius: '5px',
                }}
              >
                <strong>Marker {marker.id}</strong>
                <br />
                <small>
                  Confidence: {((marker.confidence || 0) * 100).toFixed(0)}%
                  {marker.pose && (
                    <> | Position: ({marker.pose.position.x.toFixed(2)}, {marker.pose.position.y.toFixed(2)}, {marker.pose.position.z.toFixed(2)})</>
                  )}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={start}
          disabled={!isInitialized || isRunning}
          style={{
            flex: 1,
            padding: '12px 24px',
            background: isRunning ? '#666' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          Start AR
        </button>
        <button
          onClick={stop}
          disabled={!isRunning}
          style={{
            flex: 1,
            padding: '12px 24px',
            background: !isRunning ? '#666' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: !isRunning ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          Stop AR
        </button>
      </div>
    </div>
  );
}

/**
 * Marker Tracking Component using specialized hook
 */
export function MarkerTrackingComponent() {
  const [detectedMarkers, setDetectedMarkers] = React.useState<number[]>([]);

  const {
    isRunning,
    fps,
    markers,
  } = useMarkerTracking({
    markerConfig: {
      dictionary: 'ARUCO_4X4_50',
      markerSize: 0.1,
    },
    onMarkerDetected: (marker: TrackedMarker) => {
      setDetectedMarkers((prev) => {
        if (!prev.includes(marker.id)) {
          return [...prev, marker.id];
        }
        return prev;
      });
    },
    onMarkerLost: (markerId: number) => {
      setDetectedMarkers((prev) => prev.filter((id) => id !== markerId));
    },
  });

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>Marker Tracking Hook Example</h1>
      <p>Running: {isRunning ? 'Yes' : 'No'}</p>
      <p>FPS: {fps}</p>
      <p>Active Markers: {markers.length}</p>
      <p>Total Detected: {detectedMarkers.length}</p>

      <div style={{ marginTop: '20px' }}>
        <h3>Marker History:</h3>
        <ul>
          {detectedMarkers.map((id) => (
            <li key={id}>Marker {id}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default BasicARComponent;
