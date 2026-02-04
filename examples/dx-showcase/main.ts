/**
 * Developer Experience Showcase
 * Demonstrates the improved, developer-friendly API
 */

import { ARBuilder } from '../../src/core/ar-builder';
import { createDebugOverlay } from '../../src/utils/ar-debug';
import { printDiagnostics, withErrorHandling } from '../../src/utils/ar-errors';

// Example 1: Ultra-simple quick start
async function quickStartExample() {
  console.log('=== Quick Start Example ===');

  // One-liner AR setup!
  const ar = await ARBuilder.createQuick({
    markers: true,
    onFrame: (frame) => {
      console.log(`Frame ${frame.timestamp}: ${frame.markers?.length || 0} markers`);
    },
  });

  console.log('AR running!', ar);
}

// Example 2: Fluent builder API
async function builderExample() {
  console.log('=== Builder API Example ===');

  const ar = await ARBuilder
    .preset('mobile') // Start with mobile preset
    .camera({ width: 640, height: 480, frameRate: 30 })
    .enableMarkers({ dictionarySize: 4, markerSize: 0.1 })
    .enablePlanes({ ransacIterations: 128 })
    .onMarkerDetected((marker) => {
      console.log(`✨ Found marker ${marker.id} with confidence ${marker.confidence}`);
    })
    .onPlaneDetected((plane) => {
      console.log(`🟦 Found plane with area ${plane.area.toFixed(2)}m²`);
    })
    .onFPSChange((fps) => {
      console.log(`FPS: ${fps}`);
    })
    .onError((error) => {
      console.error('AR Error:', error);
    })
    .build();

  console.log('AR configured and running!', ar);
}

// Example 3: With debug visualization
async function debugExample() {
  console.log('=== Debug Visualization Example ===');

  // Create debug overlay
  const { debug } = createDebugOverlay({
    showFPS: true,
    showMarkers: true,
    showPlanes: true,
    showStats: true,
    markerColor: '#00ff00',
    planeColor: '#0088ff',
  });

  // Setup AR with debug callback
  const ar = await ARBuilder
    .preset('desktop')
    .enableMarkers()
    .enablePlanes()
    .onFrame((frame) => {
      // Draw debug visualization
      debug.draw(frame);
    })
    .build();

  console.log('AR with debug overlay running!');

  // Screenshot after 5 seconds
  setTimeout(() => {
    const screenshot = debug.screenshot();
    console.log('Screenshot taken:', screenshot.substring(0, 50) + '...');
  }, 5000);
}

// Example 4: Error handling
async function errorHandlingExample() {
  console.log('=== Error Handling Example ===');

  await withErrorHandling(
    async () => {
      // Diagnose environment first
      await printDiagnostics();

      // Try to initialize AR
      const ar = await ARBuilder
        .preset('high-quality')
        .enableMarkers()
        .build();

      console.log('AR initialized successfully!');
    },
    (error) => {
      // Custom error handler
      alert(`AR Error: ${error.message}\n\n${error.solution || ''}`);
    }
  );
}

// Example 5: Different presets
async function presetsExample() {
  console.log('=== Presets Example ===');

  // Mobile preset (optimized for battery and performance)
  const mobile = ARBuilder.preset('mobile');

  // Desktop preset (balanced quality and performance)
  const desktop = ARBuilder.preset('desktop');

  // High quality preset (maximum quality)
  const highQuality = ARBuilder.preset('high-quality');

  // Low latency preset (prioritize responsiveness)
  const lowLatency = ARBuilder.preset('low-latency');

  // Battery saver preset (minimum power consumption)
  const batterySaver = ARBuilder.preset('battery-saver');

  console.log('All presets available:', {
    mobile,
    desktop,
    highQuality,
    lowLatency,
    batterySaver,
  });
}

// Example 6: Event-driven architecture
async function eventsExample() {
  console.log('=== Events Example ===');

  const trackedMarkers = new Set<number>();

  const ar = await ARBuilder
    .preset('desktop')
    .enableMarkers()
    .onMarkerDetected((marker) => {
      if (!trackedMarkers.has(marker.id)) {
        trackedMarkers.add(marker.id);
        console.log(`🎯 New marker detected: ${marker.id}`);
        // Show notification, play sound, etc.
      }
    })
    .onMarkerLost((markerId) => {
      trackedMarkers.delete(markerId);
      console.log(`👋 Marker lost: ${markerId}`);
    })
    .onFPSChange((fps) => {
      if (fps < 30) {
        console.warn(`⚠️ Low FPS: ${fps}`);
      }
    })
    .build();

  console.log('Event-driven AR running!');
}

// Main demo selector
async function main() {
  const examples = {
    '1': { name: 'Quick Start', fn: quickStartExample },
    '2': { name: 'Builder API', fn: builderExample },
    '3': { name: 'Debug Visualization', fn: debugExample },
    '4': { name: 'Error Handling', fn: errorHandlingExample },
    '5': { name: 'Presets', fn: presetsExample },
    '6': { name: 'Events', fn: eventsExample },
  };

  console.log('🚀 Developer Experience Showcase');
  console.log('Available examples:');
  Object.entries(examples).forEach(([key, { name }]) => {
    console.log(`  ${key}. ${name}`);
  });

  // For demo, run all examples in sequence
  for (const [key, { name, fn }] of Object.entries(examples)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Running Example ${key}: ${name}`);
    console.log('='.repeat(50));
    try {
      await fn();
    } catch (error) {
      console.error(`Example ${key} failed:`, error);
    }
    console.log('\n');
  }

  console.log('✅ All examples completed!');
}

// Run on page load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', main);
}

export { main };
