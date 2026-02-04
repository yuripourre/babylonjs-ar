# BabylonJS AR Examples

Complete examples demonstrating all features of babylonjs-ar with both Babylon.js and Three.js.

## 🎯 Examples

### ⭐ Recommended: Complete Hybrid Demos

#### `babylon-hybrid-complete.html` (NEW)
**Complete AR showcase with all features enabled**
- ✅ Marker tracking (ArUco 4x4, multiple simultaneous)
- ✅ Plane detection (horizontal & vertical surfaces)
- ✅ Depth estimation integration (stereo/ML-based)
- ✅ Feature tracking pipeline
- ✅ Real-time statistics & FPS
- ✅ Toggle controls for each feature
- ✅ Multiple 3D object types with animations
- ✅ Interactive UI with status indicators

**Best for:** Understanding full capabilities, testing all features

#### `three-hybrid-complete.html` (NEW)
**Three.js version of complete AR demo**
- Same features as Babylon.js version
- Three.js specific optimizations
- Phong lighting model
- Custom Three.js animations

**Best for:** Three.js developers, cross-framework comparison

---

### Babylon.js Examples

### 1. ArUco Marker Example (`babylon-aruco-marker.html`)

**What it does:** Tracks ArUco markers in real-time and places 3D cubes on them.

**Features:**
- ✅ Real-time marker detection
- ✅ Automatic 3D object placement
- ✅ Spinning animated cubes
- ✅ Multiple markers support
- ✅ Download test marker button

**How to use:**
```bash
# Option 1: Open directly in browser
open babylon-aruco-marker.html

# Option 2: Serve with local server
python -m http.server 8000
# Then open http://localhost:8000/babylon-aruco-marker.html
```

**Steps:**
1. Allow camera access when prompted
2. Print a marker from https://chev.me/arucogen/ (4x4 Dictionary, IDs 0-49)
3. Or click "Download Test Marker" button
4. Point camera at the marker
5. Watch the 3D cube appear!

**Supported Markers:**
- **4x4 Dictionary**: 50 markers (IDs 0-49)
- **5x5 Dictionary**: 100 markers (IDs 0-99)
- **6x6 Dictionary**: 50 markers (IDs 0-49)

**Tip:** Keep marker flat and well-lit for best tracking.

---

### 2. Markerless Image Example (`babylon-markerless-image.html`)

**What it does:** Upload an image, detect flat surfaces, and place 3D objects on them.

**Features:**
- ✅ Drag & drop image upload
- ✅ Automatic plane detection
- ✅ Multiple 3D object types (cube, sphere, cylinder, torus)
- ✅ Interactive 3D view
- ✅ Visual plane indicators

**How to use:**
```bash
# Option 1: Open directly in browser
open babylon-markerless-image.html

# Option 2: Serve with local server
python -m http.server 8000
# Then open http://localhost:8000/babylon-markerless-image.html
```

**Steps:**
1. Drag & drop or click to upload an image
2. Choose a photo with flat surfaces (floor, table, wall)
3. Click "Detect Planes"
4. Add 3D objects with the buttons
5. Rotate the view with your mouse!

**Tip:** Photos with good lighting and clear textures work best.

---

### Three.js Examples

### 3. Three.js ArUco Marker (`three-aruco-marker.html`)
**Marker tracking with Three.js**
- ArUco marker detection with Three.js renderer
- Object3D anchor system
- VideoTexture background integration
- Animated cubes on markers

### 4. Three.js Markerless Image (`three-markerless-image.html`)
**Plane detection with Three.js**
- Image upload and plane detection
- Three.js specific geometry
- OrbitControls for interaction
- Multiple mesh types

---

## 📊 Feature Matrix

| Example | Markers | Planes | Depth | Features | Framework |
|---------|---------|--------|-------|----------|-----------|
| babylon-hybrid-complete | ✅ | ✅ | 🔄 | 🔄 | Babylon.js |
| three-hybrid-complete | ✅ | ✅ | 🔄 | 🔄 | Three.js |
| babylon-aruco-marker | ✅ | ❌ | ❌ | ❌ | Babylon.js |
| babylon-markerless-image | ❌ | ✅ | ❌ | ❌ | Babylon.js |
| three-aruco-marker | ✅ | ❌ | ❌ | ❌ | Three.js |
| three-markerless-image | ❌ | ✅ | ❌ | ❌ | Three.js |

Legend: ✅ Implemented | 🔄 Requires Setup | ❌ Not included

---

## 🚀 Quick Start

### Minimal ArUco Marker Code

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.babylonjs.com/babylon.js"></script>
</head>
<body>
  <canvas id="renderCanvas" style="width:100vw; height:100vh;"></canvas>

  <script type="module">
    import { ARBuilder } from './path/to/dist/index.js';

    // Create Babylon.js scene
    const canvas = document.getElementById('renderCanvas');
    const engine = new BABYLON.Engine(canvas);
    const scene = new BABYLON.Scene(engine);

    // Camera and light
    const camera = new BABYLON.ArcRotateCamera('cam', 0, 0, 5, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas);
    new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);

    // Store marker anchors
    const anchors = new Map();

    // Setup AR with markers
    const ar = await ARBuilder
      .preset('desktop')
      .enableMarkers()
      .onFrame((frame) => {
        if (!frame.markers) return;

        for (const marker of frame.markers) {
          // Create cube for new marker
          if (!anchors.has(marker.id)) {
            const box = BABYLON.MeshBuilder.CreateBox('box', { size: 0.05 }, scene);
            box.position = new BABYLON.Vector3(
              marker.pose.position.x,
              marker.pose.position.y,
              marker.pose.position.z
            );
            anchors.set(marker.id, box);
          }
        }
      })
      .build();

    // Render loop
    engine.runRenderLoop(() => scene.render());
  </script>
</body>
</html>
```

### Minimal Plane Detection Code

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.babylonjs.com/babylon.js"></script>
</head>
<body>
  <canvas id="renderCanvas" style="width:100vw; height:100vh;"></canvas>
  <input type="file" id="upload" accept="image/*">

  <script type="module">
    import { ARBuilder } from './path/to/dist/index.js';

    // Create scene
    const canvas = document.getElementById('renderCanvas');
    const engine = new BABYLON.Engine(canvas);
    const scene = new BABYLON.Scene(engine);

    const camera = new BABYLON.ArcRotateCamera('cam', 0, 0, 5, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas);
    new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);

    // Setup AR with planes
    const ar = await ARBuilder
      .preset('desktop')
      .enablePlanes()
      .onFrame((frame) => {
        if (!frame.planes) return;

        for (const plane of frame.planes) {
          // Create object on plane
          const sphere = BABYLON.MeshBuilder.CreateSphere('sphere', { diameter: 0.3 }, scene);
          sphere.position = new BABYLON.Vector3(
            plane.centroid.x,
            plane.centroid.y,
            plane.centroid.z
          );
        }
      })
      .build();

    engine.runRenderLoop(() => scene.render());
  </script>
</body>
</html>
```

---

## 📚 Documentation

### BabylonAR Adapter

For more advanced integration, use the `BabylonAR` adapter:

```javascript
import { createBabylonAR } from 'babylonjs-ar';

const ar = await createBabylonAR({
  preset: 'desktop',
  enableMarkers: true,
  onMarkerDetected: (marker, anchor) => {
    // anchor is a Babylon.js TransformNode
    // Add meshes as children
    const box = BABYLON.MeshBuilder.CreateBox('box', { size: 0.1 }, ar.scene);
    box.parent = anchor;
  },
});

// Access Babylon.js scene
ar.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

// Get marker anchor
const anchor = ar.getMarkerAnchor(0);
```

---

## 🎨 Customization

### Change Cube Colors

```javascript
const mat = new BABYLON.StandardMaterial('mat', scene);
mat.diffuseColor = new BABYLON.Color3(1, 0, 0); // Red
box.material = mat;
```

### Add Physics

```javascript
box.physicsImpostor = new BABYLON.PhysicsImpostor(
  box,
  BABYLON.PhysicsImpostor.BoxImpostor,
  { mass: 1, restitution: 0.9 },
  scene
);
```

### Add Animations

```javascript
scene.registerBeforeRender(() => {
  box.rotation.y += 0.02;
  box.position.y = Math.sin(Date.now() / 1000) * 0.1;
});
```

---

## 🐛 Troubleshooting

### Camera not working
- Ensure HTTPS or localhost
- Allow camera permissions
- Check browser supports WebGPU (Chrome 113+, Edge 113+)

### Markers not detected
- Print marker at least 5cm × 5cm
- Ensure good lighting
- Keep marker flat and unobstructed
- Use correct dictionary size (4x4, 5x5, or 6x6)
- Verify marker ID is within supported range

### Image upload not working
- Use JPG or PNG format
- Image should have clear, flat surfaces
- Good lighting and texture in photo

### Performance issues
- Use `preset('mobile')` on slower devices
- Reduce camera resolution
- Disable unused features

---

## 📖 Additional Resources

- [Developer Guide](../docs/DEVELOPER_GUIDE.md)
- [API Reference](../docs/API.md)
- [Babylon.js Documentation](https://doc.babylonjs.com/)
- [ArUco Marker Generator](https://chev.me/arucogen/)

---

## 💡 Tips & Best Practices

1. **Lighting:** AR works best with good, even lighting
2. **Marker Size:** Print markers at least 5-10cm for best detection
3. **Image Quality:** Use high-quality photos with clear textures
4. **Performance:** Start with mobile preset, upgrade if performance allows
5. **Testing:** Test with multiple markers/planes before deploying

---

## 🆘 Need Help?

- **Issues:** https://github.com/anthropics/babylonjs-ar/issues
- **Discussions:** https://github.com/anthropics/babylonjs-ar/discussions
- **Examples:** Try the examples in this directory first!

---

**Have fun building AR experiences! 🚀**
