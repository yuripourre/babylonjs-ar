# BabylonJS AR

High-performance WebGPU AR library for Babylon.js with hybrid marker tracking and plane detection.

## Features

- **WebGPU Compute Shaders**: All CV algorithms run on GPU for maximum performance
- **Hybrid Tracking**: ArUco markers + markerless feature tracking + plane detection
- **6DOF Pose Estimation**: Full position and orientation tracking
- **Framework-Agnostic Core**: Use standalone or integrate with Babylon.js
- **Zero Dependencies**: No OpenCV.js or WASM overhead
- **Modern Runtime**: Built for Bun with TypeScript

## Status

🚧 **Phase 1: Foundation** (In Progress)

- ✅ Project setup
- ✅ WebGPU context and pipeline infrastructure
- ✅ Camera acquisition with VideoFrame
- ✅ Grayscale conversion compute shader
- ✅ Main AR engine loop
- ✅ Basic example

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- Modern browser with WebGPU support (Chrome 113+, Edge 113+)
- Webcam for AR

### Installation

```bash
# Clone repository
git clone <repo-url>
cd babylonjs-ar

# Install dependencies
bun install

# Run basic example
bun run dev
```

### Browser Compatibility

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | ✅ 113+ | ✅ 121+ |
| Edge | ✅ 113+ | ✅ 121+ |
| Safari | ⏳ Soon | ⏳ Soon |
| Firefox | ⏳ Soon | ⏳ Soon |

## Architecture

```
Camera Feed (60fps)
    ↓
VideoFrame (zero-copy)
    ↓
WebGPU Compute Pipelines
    ├─ Preprocessing (grayscale, blur, pyramid)
    ├─ Feature Detection (FAST, ORB)
    ├─ Marker Detection (ArUco)
    ├─ Plane Detection (RANSAC)
    └─ Environment Estimation (depth, lighting)
    ↓
6DOF Pose Estimation (EPnP + Kalman)
    ↓
Babylon.js Scene Integration
```

## Performance Targets

- **Desktop**: 60 FPS @ 1080p
- **Mobile**: 30-60 FPS @ 720p (adaptive)
- **Frame Budget**: 30-45ms total

## Development

```bash
# Build library
bun run build

# Run tests
bun test

# Run benchmarks
bun run bench
```

## Roadmap

- [x] Phase 1: Foundation (Camera + WebGPU)
- [ ] Phase 2: Marker Detection (ArUco)
- [ ] Phase 3: Feature Tracking (FAST + ORB)
- [ ] Phase 4: Plane Detection (RANSAC)
- [ ] Phase 5: Environment Estimation (Depth + Lighting)
- [ ] Phase 6: Babylon.js Integration
- [ ] Phase 7: Polish & Documentation

## License

MIT
