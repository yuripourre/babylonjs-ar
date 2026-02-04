
# Developer Guide - Enhanced API

This guide showcases the improved developer experience features added in v0.6.0.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Before & After Comparison](#before--after-comparison)
3. [Builder API](#builder-api)
4. [Presets](#presets)
5. [Event System](#event-system)
6. [Debug Tools](#debug-tools)
7. [Error Handling](#error-handling)
8. [React Integration](#react-integration)
9. [TypeScript Support](#typescript-support)

---

## Quick Start

### Absolute Minimum (One-Liner)

```typescript
import { ARBuilder } from 'babylonjs-ar';

// That's it! AR with marker tracking running in one line:
const ar = await ARBuilder.createQuick({ markers: true });
```

### With Frame Callback

```typescript
const ar = await ARBuilder.createQuick({
  markers: true,
  planes: true,
  onFrame: (frame) => {
    console.log(`Markers: ${frame.markers?.length || 0}`);
    console.log(`Planes: ${frame.planes?.length || 0}`);
  },
});
```

---

## Before & After Comparison

### Old API (v0.5.0)

```typescript
import { AREngine } from 'babylonjs-ar';

// Check WebGPU support manually
if (!navigator.gpu) {
  throw new Error('WebGPU not supported');
}

// Create engine
const engine = new AREngine();

// Configure and initialize
await engine.initialize({
  camera: {
    width: 1280,
    height: 720,
    facingMode: 'environment',
    frameRate: 60,
  },
  gpu: {
    powerPreference: 'high-performance',
  },
  enableMarkerTracking: true,
  enablePlaneDetection: true,
  tracker: {
    markerDetector: {
      dictionarySize: 4,
      markerSize: 0.1,
      minMarkerPerimeter: 100,
      adaptiveThresholdBlockSize: 15,
    },
    poseEstimator: {},
  },
  planeDetector: {
    ransacIterations: 256,
    minInliers: 150,
    distanceThreshold: 0.05,
  },
});

// Start manually
engine.start((frame) => {
  // Handle frame
  if (frame.markers) {
    for (const marker of frame.markers) {
      console.log(`Marker ${marker.id}`);
    }
  }
});

// Manual cleanup
window.addEventListener('beforeunload', () => {
  engine.destroy();
});
```

**Issues:**
- ❌ 30+ lines for basic setup
- ❌ No error handling or diagnostics
- ❌ No type hints for valid options
- ❌ Manual lifecycle management
- ❌ Verbose nested configuration
- ❌ No presets for common scenarios
- ❌ No event system for detections

### New API (v0.6.0)

```typescript
import { ARBuilder } from 'babylonjs-ar';

// 8 lines with better features!
const ar = await ARBuilder
  .preset('desktop')
  .enableMarkers()
  .enablePlanes()
  .onMarkerDetected((marker) => console.log(`Found: ${marker.id}`))
  .onPlaneDetected((plane) => console.log(`Plane: ${plane.area}m²`))
  .onError((error) => alert(error.solution))
  .build();
```

**Benefits:**
- ✅ 8 lines with fluent API
- ✅ Automatic error handling with solutions
- ✅ TypeScript autocomplete for all options
- ✅ Auto-cleanup on page unload
- ✅ Preset-based configuration
- ✅ Event-driven architecture
- ✅ Better debugging tools

---

## Builder API

### Basic Usage

```typescript
const ar = await ARBuilder
  .preset('mobile') // Start with preset
  .camera({ width: 640, height: 480 }) // Override camera
  .enableMarkers({ dictionarySize: 4 }) // Enable features
  .onFrame((frame) => { /* ... */ }) // Add callbacks
  .build(); // Initialize and start
```

### Available Methods

| Method | Description | Example |
|--------|-------------|---------|
| `preset(name)` | Start with preset | `.preset('mobile')` |
| `camera(config)` | Configure camera | `.camera({ width: 1280 })` |
| `gpu(config)` | Configure GPU | `.gpu({ powerPreference: 'high-performance' })` |
| `enableMarkers(config)` | Enable markers | `.enableMarkers({ dictionarySize: 4 })` |
| `enablePlanes(config)` | Enable planes | `.enablePlanes({ ransacIterations: 256 })` |
| `adaptiveQuality(enabled)` | Toggle adaptive quality | `.adaptiveQuality(true)` |
| `temporalCoherence(enabled)` | Toggle temporal coherence | `.temporalCoherence(true)` |
| `autoStart(enabled)` | Auto-start after build | `.autoStart(true)` |
| `onReady(callback)` | Engine ready event | `.onReady(() => console.log('Ready!'))` |
| `onFrame(callback)` | Frame callback | `.onFrame((frame) => {})` |
| `onMarkerDetected(callback)` | Marker detected | `.onMarkerDetected((m) => {})` |
| `onMarkerLost(callback)` | Marker lost | `.onMarkerLost((id) => {})` |
| `onPlaneDetected(callback)` | Plane detected | `.onPlaneDetected((p) => {})` |
| `onPlaneUpdated(callback)` | Plane updated | `.onPlaneUpdated((p) => {})` |
| `onError(callback)` | Error handler | `.onError((e) => {})` |
| `onFPSChange(callback)` | FPS changed | `.onFPSChange((fps) => {})` |
| `build()` | Build and initialize | `.build()` |

---

## Presets

Five optimized presets for common scenarios:

### 1. Mobile (default for mobile devices)

```typescript
ARBuilder.preset('mobile')
```

- 640×480 @ 30fps
- Low power GPU mode
- Smaller block sizes (11×11)
- 128 RANSAC iterations
- **Use for:** Phones, tablets, battery-conscious apps

### 2. Desktop (default for desktops)

```typescript
ARBuilder.preset('desktop')
```

- 1280×720 @ 60fps
- High performance GPU
- Standard block sizes (15×15)
- 256 RANSAC iterations
- **Use for:** Desktop browsers, powerful laptops

### 3. High Quality

```typescript
ARBuilder.preset('high-quality')
```

- 1920×1080 @ 60fps
- Maximum quality settings
- 512 RANSAC iterations
- **Use for:** Demos, professional applications, powerful hardware

### 4. Low Latency

```typescript
ARBuilder.preset('low-latency')
```

- 640×480 @ 120fps (if supported)
- Minimal processing overhead
- 64 RANSAC iterations
- **Use for:** Real-time tracking, competitive applications

### 5. Battery Saver

```typescript
ARBuilder.preset('battery-saver')
```

- 480×360 @ 15fps
- Aggressive power saving
- Minimal quality settings
- **Use for:** Long-running applications, weak devices

---

## Event System

### Marker Events

```typescript
const trackedMarkers = new Set();

const ar = await ARBuilder
  .enableMarkers()
  .onMarkerDetected((marker) => {
    console.log(`✨ New marker: ${marker.id}`);
    console.log(`  Confidence: ${(marker.confidence * 100).toFixed(0)}%`);
    console.log(`  Position: ${marker.corners.topLeft}`);

    // Play sound, show notification, etc.
    trackedMarkers.add(marker.id);
  })
  .onMarkerLost((markerId) => {
    console.log(`👋 Lost marker: ${markerId}`);
    trackedMarkers.delete(markerId);
  })
  .build();
```

### Plane Events

```typescript
const ar = await ARBuilder
  .enablePlanes()
  .onPlaneDetected((plane) => {
    console.log(`🟦 New plane detected`);
    console.log(`  Area: ${plane.area.toFixed(2)}m²`);
    console.log(`  Normal: (${plane.normal.x}, ${plane.normal.y}, ${plane.normal.z})`);
    console.log(`  Distance: ${plane.distance}m`);

    // Place virtual objects on the plane
  })
  .onPlaneUpdated((plane) => {
    console.log(`🔄 Plane updated: ${plane.id}`);
    // Update placed objects
  })
  .build();
```

### Performance Events

```typescript
const ar = await ARBuilder
  .preset('desktop')
  .onFPSChange((fps) => {
    if (fps < 30) {
      console.warn(`⚠️  Low FPS: ${fps}`);
      // Reduce quality, show warning
    } else if (fps > 55) {
      console.log(`✅ Great FPS: ${fps}`);
      // Can increase quality
    }
  })
  .build();
```

---

## Debug Tools

### Visual Debug Overlay

```typescript
import { ARBuilder, createDebugOverlay } from 'babylonjs-ar';

// Create debug canvas overlay
const { debug } = createDebugOverlay({
  showFPS: true,
  showMarkers: true,
  showPlanes: true,
  showStats: true,
  markerColor: '#00ff00',
  planeColor: '#0088ff',
  fontSize: 14,
});

// Connect to AR engine
const ar = await ARBuilder
  .preset('desktop')
  .enableMarkers()
  .enablePlanes()
  .onFrame((frame) => {
    // Draw debug visualization
    debug.draw(frame);
  })
  .build();

// Take screenshot after 5 seconds
setTimeout(() => {
  const screenshot = debug.screenshot();
  console.log('Screenshot:', screenshot);
}, 5000);
```

### Debug Features

- ✅ Real-time FPS counter (color-coded: green/orange/red)
- ✅ Marker detection visualization (corners, IDs, confidence)
- ✅ Plane boundaries and areas
- ✅ Frame statistics overlay
- ✅ Screenshot capability
- ✅ Customizable colors and fonts

---

## Error Handling

### Automatic Diagnostics

```typescript
import { printDiagnostics } from 'babylonjs-ar';

// Print environment diagnostics
await printDiagnostics();

// Output:
// 🔍 AR Environment Diagnostics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WebGPU Support: ✅
// Camera Available: ✅
// HTTPS: ✅
// GPU: NVIDIA GeForce RTX 3080
// Platform: Desktop
//
// 📋 Recommendations:
//   ✅ Environment is ready for AR!
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Developer-Friendly Error Messages

```typescript
import { withErrorHandling } from 'babylonjs-ar';

await withErrorHandling(
  async () => {
    const ar = await ARBuilder.preset('desktop').build();
  },
  (error) => {
    // Automatic error handling with solutions!
    console.error(error.getFullMessage());

    // Example output:
    // [CAMERA_PERMISSION_DENIED] Camera permission was denied
    //
    // 💡 Solution: Grant camera permission in browser settings or when prompted.
    // 📚 Docs: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
  }
);
```

### Common Errors with Solutions

| Error | Automatic Solution |
|-------|-------------------|
| WebGPU not supported | Browser update link + enable flags |
| Camera permission denied | Permission settings guide |
| Camera not found | Hardware troubleshooting steps |
| GPU context lost | Refresh page suggestion |
| Out of memory | Reduce resolution/quality tips |

---

## React Integration

### useAR Hook

```typescript
import { useAR } from 'babylonjs-ar/react';

function ARComponent() {
  const { isInitialized, markers, planes, fps } = useAR({
    preset: 'mobile',
    markers: true,
    planes: true,
    onMarkerDetected: (marker) => {
      console.log('Marker found:', marker.id);
    },
  });

  if (!isInitialized) {
    return <div>Initializing AR...</div>;
  }

  return (
    <div>
      <p>FPS: {fps}</p>
      <p>Markers: {markers.length}</p>
      <p>Planes: {planes.length}</p>
    </div>
  );
}
```

### Specialized Hooks

```typescript
// Marker tracking only
const { markers } = useMarkerTracking({
  preset: 'desktop',
  onMarkerDetected: (marker) => { /* ... */ },
});

// Plane detection only
const { planes } = usePlaneDetection({
  preset: 'mobile',
  onPlaneDetected: (plane) => { /* ... */ },
});
```

---

## TypeScript Support

### Full Type Safety

```typescript
import { ARBuilder, ARFrame, DetectedMarker } from 'babylonjs-ar';

// TypeScript infers all types automatically
const ar = await ARBuilder
  .preset('mobile') // Autocomplete: 'mobile' | 'desktop' | ...
  .camera({
    width: 640, // Autocomplete + validation
    height: 480,
    frameRate: 30,
    facingMode: 'environment', // Autocomplete: 'user' | 'environment'
  })
  .enableMarkers({
    dictionarySize: 4, // Type: 4 | 5 | 6
    markerSize: 0.1,
  })
  .onMarkerDetected((marker: DetectedMarker) => {
    // Full autocomplete for marker properties
    console.log(marker.id);
    console.log(marker.corners.topLeft);
    console.log(marker.confidence);
  })
  .onFrame((frame: ARFrame) => {
    // Full autocomplete for frame properties
    console.log(frame.timestamp);
    console.log(frame.markers);
    console.log(frame.planes);
  })
  .build();
```

### Generic Types

```typescript
// Custom frame data
interface CustomFrame extends ARFrame {
  myCustomData: string;
}

// Typed event handlers
type MarkerHandler = (marker: DetectedMarker) => void;
type PlaneHandler = (plane: DetectedPlane) => void;
```

---

## Migration Guide

### From v0.5.0 to v0.6.0

**Option 1:** Keep using old API (still supported)

```typescript
// Old API still works
const engine = new AREngine();
await engine.initialize({ /* ... */ });
```

**Option 2:** Gradual migration with builder

```typescript
// Use builder with same config
const ar = await new ARBuilder()
  .camera({ width: 1280, height: 720 })
  .gpu({ powerPreference: 'high-performance' })
  .enableMarkers()
  .enablePlanes()
  .build();
```

**Option 3:** Full migration to presets

```typescript
// Simplify with presets
const ar = await ARBuilder
  .preset('desktop')
  .enableMarkers()
  .enablePlanes()
  .build();
```

---

## Best Practices

### 1. Use Presets as Starting Point

```typescript
// ✅ Good - start with preset, override as needed
const ar = await ARBuilder
  .preset('mobile')
  .camera({ frameRate: 60 }) // Override only what you need
  .build();

// ❌ Avoid - configuring everything from scratch
const ar = await ARBuilder
  .camera({ width: 640, height: 480, frameRate: 30, facingMode: 'environment' })
  .gpu({ powerPreference: 'low-power' })
  // ... many more lines ...
  .build();
```

### 2. Use Error Handling

```typescript
// ✅ Good - with error handling
await withErrorHandling(
  async () => {
    const ar = await ARBuilder.preset('desktop').build();
  },
  (error) => {
    // User-friendly error
    showNotification(error.message, error.solution);
  }
);

// ❌ Avoid - no error handling
const ar = await ARBuilder.preset('desktop').build(); // Might fail silently
```

### 3. Use Debug Tools in Development

```typescript
// ✅ Good - debug in development
if (process.env.NODE_ENV === 'development') {
  const { debug } = createDebugOverlay();
  ar.onFrame((frame) => debug.draw(frame));
}
```

### 4. Use Events for Better Architecture

```typescript
// ✅ Good - event-driven
const ar = await ARBuilder
  .enableMarkers()
  .onMarkerDetected((marker) => {
    gameEngine.spawnObject(marker);
  })
  .onMarkerLost((id) => {
    gameEngine.removeObject(id);
  })
  .build();

// ❌ Avoid - polling in frame callback
const ar = await ARBuilder
  .enableMarkers()
  .onFrame((frame) => {
    // Manual tracking, more complex
    if (frame.markers) {
      // Compare with previous frame...
    }
  })
  .build();
```

---

## Examples Repository

See `/examples/dx-showcase/` for complete working examples:

1. **Quick Start** - Minimal one-liner setup
2. **Builder API** - Full fluent API showcase
3. **Debug Visualization** - Real-time debug overlay
4. **Error Handling** - Comprehensive error handling
5. **Presets** - All preset comparisons
6. **Events** - Event-driven architecture

---

## API Reference

Full API documentation available at: [API.md](./API.md)

---

## Support

- **Issues**: https://github.com/anthropics/babylonjs-ar/issues
- **Discussions**: https://github.com/anthropics/babylonjs-ar/discussions
- **Examples**: `/examples/` directory

---

**Version**: 0.6.0
**Last Updated**: 2026-02-04
