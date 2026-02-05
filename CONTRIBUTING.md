# Contributing to BabylonJS AR

Thank you for your interest in contributing! This guide will help you get started.

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- Node.js >= 18 (for some tooling)
- Modern browser with WebGPU support (Chrome 113+, Edge 113+)

### Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/babylonjs-ar.git
cd babylonjs-ar

# Install dependencies
bun install

# Run dev server
bun run dev

# Run tests
bun test

# Build library
bun run build
```

## 📁 Project Structure

```
babylonjs-ar/
├── src/
│   ├── core/          # Core AR engine
│   │   ├── camera/    # Camera management
│   │   ├── gpu/       # WebGPU/WebGL2 backends
│   │   ├── tracking/  # Marker & image tracking
│   │   ├── detection/ # Feature & plane detection
│   │   ├── depth/     # AI depth estimation
│   │   ├── mesh/      # 3D reconstruction
│   │   ├── lighting/  # Light estimation
│   │   ├── xr/        # WebXR integration
│   │   └── slam/      # SLAM system
│   ├── adapters/      # Framework integrations
│   └── utils/         # Shared utilities
├── tests/             # Unit & integration tests
├── examples/          # Interactive demos
├── docs/              # Documentation
└── dist/              # Build output
```

## 🎨 Code Style

We use Prettier and ESLint for consistent code formatting:

```bash
# Format code
bun run format

# Lint code
bun run lint

# Fix linting issues
bun run lint:fix
```

### Code Guidelines

- **TypeScript strict mode** - All code must type-check without errors
- **No `any` types** - Use proper typing or `unknown` with type guards
- **Functional style** - Prefer pure functions and immutability
- **WebGPU first** - Optimize for GPU computation, CPU as fallback
- **Performance-conscious** - Profile and benchmark critical paths
- **Document public APIs** - Use JSDoc for all exported functions

## 🧪 Testing

We aim for high test coverage on core functionality:

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/depth/depth-map.test.ts

# Watch mode
bun test --watch

# Coverage report
bun test --coverage
```

### Writing Tests

- **Unit tests** - Test individual functions/classes in isolation
- **Integration tests** - Test component interactions
- **Mock browser APIs** - Use test helpers from `tests/helpers/`
- **Test both WebGPU and WebGL2** - Ensure fallback works

Example test structure:

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { DepthMap } from '../../src/core/depth/depth-map';

describe('DepthMap', () => {
  let depthMap: DepthMap;

  beforeEach(() => {
    depthMap = new DepthMap(256, 192, new Float32Array(256 * 192));
  });

  test('should interpolate depth values', () => {
    const depth = depthMap.getDepthInterpolated(128.5, 96.5);
    expect(depth).toBeGreaterThan(0);
  });
});
```

## 📝 Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Build process or tooling changes

### Examples

```
feat(depth): add bilateral filtering to depth maps

Implements edge-preserving smoothing for noisy depth estimates.
Reduces noise while preserving surface boundaries.

Closes #42
```

```
fix(xr): handle missing hit-test feature gracefully

Falls back to CPU raycasting when XR hit-test is unavailable.
```

## 🔄 Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes**
   - Write code
   - Add tests
   - Update documentation

3. **Ensure everything passes**
   ```bash
   bun run lint
   bun run typecheck
   bun test
   bun run build
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat(scope): your feature description"
   ```

5. **Push and create PR**
   ```bash
   git push origin feat/your-feature-name
   ```

6. **Fill out PR template**
   - Describe what changed and why
   - Link related issues
   - Add screenshots/videos for visual changes
   - Confirm tests pass and documentation is updated

## 🎯 Areas for Contribution

### High Priority

- **Browser compatibility** - Safari/Firefox WebGPU support
- **Mobile optimization** - Battery life, thermal management
- **Documentation** - API docs, tutorials, examples
- **Test coverage** - Increase coverage for depth/mesh modules

### Feature Requests

- **Model export** - Export reconstructed meshes (.obj, .ply)
- **Texture mapping** - Apply camera frames to meshes
- **Cloud anchors** - Persistent AR experiences
- **Multi-user** - Shared AR sessions
- **Hand tracking** - MediaPipe integration

### Performance Optimization

- **Shader optimization** - Reduce workgroup sizes, optimize algorithms
- **Memory management** - Better resource pooling
- **Frame budget** - Dynamic quality adjustment
- **WASM acceleration** - Critical path functions

## 📚 Resources

### Learning Materials

- [WebGPU Fundamentals](https://webgpufundamentals.org/)
- [WebXR Device API](https://www.w3.org/TR/webxr/)
- [Computer Vision: Algorithms and Applications](http://szeliski.org/Book/)
- [Multiple View Geometry](https://www.robots.ox.ac.uk/~vgg/hzbook/)

### Project Documentation

- [Architecture Overview](./docs/DEVELOPER_GUIDE.md)
- [Performance Analysis](./docs/PERFORMANCE_ANALYSIS.md)
- [Phase 1 Summary](./PHASE1-FINAL-STATUS.md)
- [Depth & Mesh Reconstruction](./docs/DEPTH-MESH-SUMMARY.md)

## 🤝 Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Assume good intentions

### Enforcement

Unacceptable behavior will result in temporary or permanent bans.
Report issues to [maintainer email].

## 💡 Questions?

- **Bug reports** - Open an issue with reproduction steps
- **Feature requests** - Open an issue describing the use case
- **Questions** - Use GitHub Discussions
- **Security issues** - Email [security email] privately

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to BabylonJS AR!** 🎉
