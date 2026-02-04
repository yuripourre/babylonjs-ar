/**
 * Marker Tracking Example
 * Demonstrates ArUco marker detection and 6DOF tracking
 */

import { AREngine } from '../../src/index';

// DOM elements
const statusEl = document.getElementById('status')!;
const fpsEl = document.getElementById('fps')!;
const resolutionEl = document.getElementById('resolution')!;
const markerCountEl = document.getElementById('marker-count')!;
const markersEl = document.getElementById('markers')!;
const videoPreview = document.getElementById('video-preview') as HTMLVideoElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const instructionsEl = document.getElementById('instructions')!;

// Update status message
function updateStatus(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  console.log(`[Status] ${message}`);
}

// Main application
async function main() {
  try {
    updateStatus('Checking WebGPU support...', 'info');

    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }

    updateStatus('WebGPU supported ✓', 'success');

    // Create AR engine with marker tracking enabled
    updateStatus('Initializing AR engine...', 'info');
    const arEngine = new AREngine();

    // Initialize with camera config and marker tracking
    await arEngine.initialize({
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
      tracker: {
        markerDetectorConfig: {
          markerSize: 0.1, // 10cm markers
          dictionarySize: 4, // ArUco 4x4
          minMarkerPerimeter: 80,
          maxMarkerPerimeter: 2000,
        },
      },
    });

    updateStatus('AR engine initialized ✓', 'success');

    // Get camera resolution
    const resolution = arEngine.getCameraManager().getResolution();
    if (resolution) {
      resolutionEl.textContent = `Resolution: ${resolution.width}x${resolution.height}`;
    }

    // Connect video preview
    const videoElement = arEngine.getCameraManager().getVideoElement();
    if (videoElement) {
      videoPreview.srcObject = videoElement.srcObject;
    }

    // Setup canvas for visualization
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    // Resize canvas to match window
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Hide instructions after 5 seconds
    setTimeout(() => {
      instructionsEl.style.display = 'none';
    }, 5000);

    // Start AR processing
    updateStatus('AR running - show marker to camera ✓', 'success');

    let frameCount = 0;
    let lastFPSUpdate = performance.now();
    let detectedAnyMarker = false;

    arEngine.start((frame) => {
      // Update FPS counter
      frameCount++;
      const now = performance.now();
      if (now - lastFPSUpdate >= 1000) {
        const fps = Math.round((frameCount * 1000) / (now - lastFPSUpdate));
        fpsEl.textContent = `FPS: ${fps}`;
        frameCount = 0;
        lastFPSUpdate = now;
      }

      // Clear canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw marker info
      if (frame.markers && frame.markers.length > 0) {
        detectedAnyMarker = true;
        markerCountEl.textContent = frame.markers.length.toString();

        // Update marker list
        markersEl.innerHTML = '';
        for (const marker of frame.markers) {
          const markerDiv = document.createElement('div');
          markerDiv.className = `marker ${marker.trackingState === 'lost' ? 'lost' : ''}`;
          markerDiv.innerHTML = `
            ID: ${marker.id} |
            State: ${marker.trackingState} |
            Confidence: ${(marker.confidence * 100).toFixed(0)}%
          `;
          markersEl.appendChild(markerDiv);

          // Draw marker corners on canvas (if we have position data)
          // This is a placeholder - full visualization coming in Phase 6
          ctx.strokeStyle = marker.trackingState === 'tracking' ? '#00ff00' : '#ffaa00';
          ctx.lineWidth = 3;
          ctx.font = '24px monospace';
          ctx.fillStyle = '#00ff00';

          // Draw marker indicator (simplified)
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          ctx.strokeRect(centerX - 50, centerY - 50, 100, 100);
          ctx.fillText(`Marker ${marker.id}`, centerX - 40, centerY - 60);
        }

        // Hide instructions if marker detected
        if (instructionsEl.style.display !== 'none') {
          instructionsEl.style.display = 'none';
        }
      } else {
        markerCountEl.textContent = '0';
        markersEl.innerHTML = '';

        // Show hint if no markers detected after some time
        if (detectedAnyMarker) {
          ctx.fillStyle = 'white';
          ctx.font = '24px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('No markers detected', canvas.width / 2, canvas.height / 2);
        } else {
          ctx.fillStyle = 'white';
          ctx.font = '24px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('Show an ArUco marker to the camera', canvas.width / 2, canvas.height / 2);
        }
      }

      // Draw frame info
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '16px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Frame: ${frame.width}x${frame.height}`, 10, canvas.height - 40);
      ctx.fillText(`Timestamp: ${frame.timestamp.toFixed(2)}ms`, 10, canvas.height - 20);
    });

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      arEngine.destroy();
    });

  } catch (error) {
    console.error('Error:', error);
    updateStatus(`Error: ${error}`, 'error');

    // Show helpful message
    const instructionsEl = document.getElementById('instructions')!;
    instructionsEl.innerHTML = `
      <h2>⚠️ Error</h2>
      <p>${error}</p>
      <p><small>Make sure you're using Chrome 113+ or Edge 113+ with WebGPU enabled.</small></p>
    `;
    instructionsEl.style.display = 'block';
  }
}

// Start when page loads
main();
