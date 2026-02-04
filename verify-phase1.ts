/**
 * Phase 1 Verification Script
 * Checks that all components are properly set up
 */

import { AREngine, GPUContextManager, CameraManager, ComputePipeline } from './src/index';
import { Matrix4, Vector3, Quaternion } from './src/index';

console.log('🔍 Verifying Phase 1 Components...\n');

// Check exports
console.log('✅ Core exports:');
console.log('  - AREngine:', typeof AREngine === 'function');
console.log('  - GPUContextManager:', typeof GPUContextManager === 'function');
console.log('  - CameraManager:', typeof CameraManager === 'function');
console.log('  - ComputePipeline:', typeof ComputePipeline === 'function');

console.log('\n✅ Math utilities:');
console.log('  - Matrix4:', typeof Matrix4 === 'function');
console.log('  - Vector3:', typeof Vector3 === 'function');
console.log('  - Quaternion:', typeof Quaternion === 'function');

// Test math utilities
console.log('\n🧮 Testing math utilities...');

const v1 = new Vector3(1, 0, 0);
const v2 = new Vector3(0, 1, 0);
const cross = v1.cross(v2);
console.log(`  Vector3 cross product: (1,0,0) × (0,1,0) = (${cross.x},${cross.y},${cross.z})`);
console.log(`  Expected: (0,0,1) - ${cross.z === 1 ? '✅' : '❌'}`);

const m1 = Matrix4.identity();
const m2 = Matrix4.translation(1, 2, 3);
const translation = m2.getTranslation();
console.log(`  Matrix4 translation: [${translation.join(', ')}]`);
console.log(`  Expected: [1, 2, 3] - ${translation[0] === 1 && translation[1] === 2 && translation[2] === 3 ? '✅' : '❌'}`);

const q1 = Quaternion.identity();
const q2 = Quaternion.fromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
console.log(`  Quaternion from axis-angle: w=${q2.w.toFixed(2)}`);
console.log(`  Expected: w≈0.71 - ${Math.abs(q2.w - 0.707) < 0.01 ? '✅' : '❌'}`);

// Check file structure
console.log('\n📁 Checking file structure...');
const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'bunfig.toml',
  'README.md',
  'src/index.ts',
  'src/core/engine.ts',
  'src/core/gpu/gpu-context.ts',
  'src/core/gpu/compute-pipeline.ts',
  'src/core/camera/camera-manager.ts',
  'src/core/math/matrix.ts',
  'src/core/math/vector.ts',
  'src/core/math/quaternion.ts',
  'src/shaders/index.ts',
  'examples/babylon-basic/index.html',
  'examples/babylon-basic/main.ts',
  'docs/PHASE1.md',
];

let allFilesExist = true;
for (const file of requiredFiles) {
  const exists = await Bun.file(file).exists();
  if (!exists) {
    console.log(`  ❌ Missing: ${file}`);
    allFilesExist = false;
  }
}

if (allFilesExist) {
  console.log('  ✅ All required files exist');
}

console.log('\n🎉 Phase 1 Verification Complete!');
console.log('\n📝 Next steps:');
console.log('  1. Run: bun run dev');
console.log('  2. Open: http://localhost:3000/examples/babylon-basic/');
console.log('  3. Allow camera access');
console.log('  4. Verify camera feed and FPS counter');
console.log('\n🚀 Ready to start Phase 2: Marker Detection');
