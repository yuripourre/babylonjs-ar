# BabylonJS AR V2 Examples

This directory contains production-ready examples demonstrating the V2.0.0 plugin-based architecture.

## 🚀 Quick Start

All examples use the V2 API with plugins. Simply open any HTML file in a WebGPU-compatible browser:

```bash
# Using a local server (recommended)
python3 -m http.server 8000
# or
npx serve .

# Then open: http://localhost:8000/examples/01-basic-marker-tracking.html
```

## 📚 Examples

### 01 - Basic Marker Tracking
**File**: `01-basic-marker-tracking.html`

The simplest example showing:
- AREngine initialization
- MarkerTrackingPlugin usage
- Event-based API (marker:detected, frame, error)
- No 3D rendering, just tracking

**Key Features**:
- Event-driven architecture
- Plugin configuration
- FPS monitoring
- Marker confidence display

**Code Snippet**:
```javascript
import { AREngine, MarkerTrackingPlugin } from '../dist/index.js';

const ar = new AREngine()
  .use(new MarkerTrackingPlugin({
    dictionary: 'ARUCO_4X4_50',
    markerSize: 0.1,
  }));

ar.on('marker:detected', (marker) => {
  console.log('Marker:', marker.id, marker.pose);
});

await ar.initialize();
await ar.start();
```

---

### 02 - Babylon.js Marker Tracking
**File**: `02-babylon-marker-tracking.html`

Full 3D integration with Babylon.js:
- Animated 3D cubes on markers
- Marker lifecycle (detected, tracked, lost)
- Transform updates (position, rotation)
- Multi-marker support

**Key Features**:
- Babylon.js scene integration
- TransformNode anchors
- Automatic marker removal
- Downloadable test markers

---

### 03 - Three.js Marker Tracking
**File**: `03-three-marker-tracking.html`

Three.js version of marker tracking:
- Three.js scene setup
- Group-based anchors
- WebGL rendering
- Same V2 API

**Key Features**:
- Three.js integration
- Mesh animations
- Responsive canvas

---

### 04 - Plugin Architecture Demo
**File**: `04-plugin-architecture.html`

Interactive plugin system demonstration:
- Dynamic plugin loading
- Multiple plugins (Marker + Depth + Mesh)
- Event logging
- Statistics dashboard
- Start/stop/destroy lifecycle

**Key Features**:
- Plugin enable/disable UI
- Real-time event log
- Performance stats
- Full lifecycle control

**Demonstrates**:
- Plugin registration
- Event system
- Error handling with ARError
- Engine lifecycle

---

### 05 - Depth Estimation
**File**: `05-depth-estimation.html`

Real-time depth map visualization:
- DepthEstimationPlugin
- Quality settings (low/medium/high)
- Color-mapped depth display
- Performance monitoring

**Key Features**:
- Depth map visualization (turbo colormap)
- FPS counter
- Resolution display
- Quality presets

---

### 06 - Mesh Reconstruction
**File**: `06-mesh-reconstruction.html`

3D mesh reconstruction from depth:
- MeshReconstructionPlugin + DepthEstimationPlugin
- TSDF voxel grid
- Marching cubes extraction
- Babylon.js mesh rendering

**Key Features**:
- Real-time mesh updates
- Voxel statistics
- Manual extraction
- Reset functionality

---

## 🎯 Browser Requirements

| Browser | Version | Status |
|---------|---------|--------|
| Chrome  | 113+    | ✅ Supported |
| Edge    | 113+    | ✅ Supported |
| Safari  | 18+     | ⏳ Experimental |
| Firefox | -       | ❌ Not yet |

**Requirements**:
- WebGPU support
- Webcam access
- HTTPS (or localhost)

---

## 🔧 Common Patterns

### Basic Setup
```javascript
import { AREngine, MarkerTrackingPlugin } from '../dist/index.js';

const ar = new AREngine()
  .use(new MarkerTrackingPlugin({ /* config */ }));

ar.on('marker:detected', (marker) => { /* ... */ });
await ar.initialize();
await ar.start();
```

### Multiple Plugins
```javascript
const ar = new AREngine()
  .use(new MarkerTrackingPlugin({ /* ... */ }))
  .use(new DepthEstimationPlugin({ /* ... */ }))
  .use(new MeshReconstructionPlugin({ /* ... */ }));
```

### Error Handling
```javascript
ar.on('error', (error) => {
  console.error('AR Error:', error.message);

  if (error instanceof ARError) {
    console.log('Error code:', error.code);
    console.log('Recoverable:', error.recoverable);

    for (const suggestion of error.suggestions) {
      console.log('💡', suggestion.message);
    }
  }
});
```

### Lifecycle Management
```javascript
// Initialize
await ar.initialize();

// Start processing
await ar.start();

// Pause
ar.stop();

// Resume
await ar.start();

// Cleanup
await ar.destroy();
```

---

## 🎨 Creating Custom Examples

### Template Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My AR Example - BabylonJS AR V2</title>
  <style>
    /* Your styles */
  </style>
</head>
<body>
  <!-- Your UI -->

  <script type="module">
    import { AREngine, /* plugins */ } from '../dist/index.js';

    async function initAR() {
      const ar = new AREngine()
        .use(/* your plugins */);

      ar.on('event', (data) => { /* ... */ });

      await ar.initialize();
      await ar.start();
    }

    initAR();
  </script>
</body>
</html>
```

### Plugin Configuration

**MarkerTrackingPlugin**:
```javascript
new MarkerTrackingPlugin({
  dictionary: 'ARUCO_4X4_50',  // or '5X5_100', '6X6_250'
  markerSize: 0.1,              // meters
  enableFiltering: true,
  minConfidence: 0.7,
  maxMarkers: 10,
})
```

**DepthEstimationPlugin**:
```javascript
new DepthEstimationPlugin({
  quality: 'medium',            // 'low', 'medium', 'high'
  inferenceInterval: 100,       // ms between inferences
})
```

**MeshReconstructionPlugin**:
```javascript
new MeshReconstructionPlugin({
  voxelSize: 0.01,              // meters
  truncationDistance: 0.05,     // meters
  extractionInterval: 30,       // frames
  autoExtract: true,
})
```

---

## 📖 Documentation

- [Main README](../README.md)
- [Breaking Changes V2](../BREAKING-CHANGES-V2.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [V2 Refactoring Complete](../V2-REFACTORING-COMPLETE.md)

---

## 🐛 Troubleshooting

### WebGPU Not Available
- Upgrade to Chrome 113+ or Edge 113+
- Enable flags: `chrome://flags/#enable-unsafe-webgpu`

### Camera Permission Denied
- Check browser permissions
- Use HTTPS or localhost
- Try different browser

### Poor Performance
- Lower quality settings
- Reduce inference intervals
- Check GPU usage in DevTools

### Import Errors
- Build the library first: `bun run build`
- Check dist/ directory exists
- Use a local server (not file://)

---

## 💡 Tips

1. **Always use a local server** - Don't open files directly (file://), use http://localhost
2. **Check the console** - All examples log helpful info to console
3. **Test with real markers** - Download from [ArUco Generator](https://chev.me/arucogen/)
4. **Print markers properly** - Use 4x4 dictionary, white border, flat surface
5. **Good lighting helps** - Marker detection works best in good lighting

---

## 🔗 Resources

- [ArUco Marker Generator](https://chev.me/arucogen/)
- [WebGPU Status](https://webgpustatus.org/)
- [Babylon.js Docs](https://doc.babylonjs.com/)
- [Three.js Docs](https://threejs.org/docs/)

---

**Built with BabylonJS AR V2.0.0** 🚀
