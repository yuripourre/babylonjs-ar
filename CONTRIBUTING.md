# Contributing to BabylonJS AR

Thank you for your interest in contributing! This guide will help you get started.

## 🏗️ Architecture Overview

BabylonJS AR V2.0.0 uses a **plugin-based architecture**:

```
AREngine (core orchestrator)
  ├── PluginManager (manages plugins)
  ├── GPUContextManager (WebGPU)
  ├── CameraManager (video input)
  └── TypedEventEmitter (events)

Plugins:
  ├── MarkerTrackingPlugin
  ├── DepthEstimationPlugin
  └── MeshReconstructionPlugin
  └── [Your custom plugin]
```

## 🚀 Quick Start

```bash
# Clone and install
git clone <repo-url>
cd babylonjs-ar
bun install

# Run tests
bun test

# Build
bun run build
```

## 🔌 Creating a Plugin

```typescript
import { BaseARPlugin, type ARContext, type ARFrame } from 'babylonjs-ar';

export class MyPlugin extends BaseARPlugin {
  readonly name = 'my-plugin';
  readonly priority = 50;

  protected async onInitialize(context: ARContext): Promise<void> {
    // Initialize
  }

  async processFrame(frame: ARFrame, context: ARContext): Promise<void> {
    // Process frame
    context.events.emit('my-event', data);
  }
}
```

See full documentation in the file for more details.
