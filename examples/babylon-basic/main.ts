/**
 * Basic AR Example
 * Demonstrates camera feed and grayscale conversion
 */

import { AREngine } from '../../src/index';

// DOM elements
const statusEl = document.getElementById('status')!;
const fpsEl = document.getElementById('fps')!;
const resolutionEl = document.getElementById('resolution')!;
const videoPreview = document.getElementById('video-preview') as HTMLVideoElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

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

    // Create AR engine
    updateStatus('Initializing AR engine...', 'info');
    const arEngine = new AREngine();

    // Initialize with camera config
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

    // Start AR processing
    updateStatus('AR running ✓', 'success');

    let frameCount = 0;
    let lastFPSUpdate = performance.now();

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

      // Visualize frame (simple overlay)
      ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'white';
      ctx.font = '48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AR Camera Active', canvas.width / 2, canvas.height / 2);

      ctx.font = '24px monospace';
      ctx.fillText(
        `Frame: ${frame.width}x${frame.height}`,
        canvas.width / 2,
        canvas.height / 2 + 40
      );
      ctx.fillText(
        `Timestamp: ${frame.timestamp.toFixed(2)}ms`,
        canvas.width / 2,
        canvas.height / 2 + 70
      );
    });

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      arEngine.destroy();
    });

  } catch (error) {
    console.error('Error:', error);
    updateStatus(`Error: ${error}`, 'error');
  }
}

// Start when page loads
main();
