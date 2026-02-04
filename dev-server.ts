/**
 * Development Server
 * Serves examples with hot reload
 */

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Redirect root to basic example
    if (path === '/' || path === '') {
      return Response.redirect('/examples/babylon-basic/', 302);
    }

    // Remove leading slash
    if (path.startsWith('/')) {
      path = path.slice(1);
    }

    // Default to index.html for directories
    if (path.endsWith('/')) {
      path += 'index.html';
    }

    try {
      const file = Bun.file(path);
      const exists = await file.exists();

      if (!exists) {
        return new Response('Not found', { status: 404 });
      }

      // Get MIME type
      const ext = path.split('.').pop() || '';
      const mimeTypes: Record<string, string> = {
        html: 'text/html',
        js: 'application/javascript',
        ts: 'application/typescript',
        css: 'text/css',
        json: 'application/json',
        wgsl: 'text/plain',
      };

      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      // For TypeScript files, transpile on the fly
      if (ext === 'ts') {
        const transpiled = await Bun.build({
          entrypoints: [path],
          target: 'browser',
          format: 'esm',
        });

        if (!transpiled.success) {
          console.error('Build errors:', transpiled.logs);
          return new Response('Build failed', { status: 500 });
        }

        const output = await transpiled.outputs[0].text();
        return new Response(output, {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-cache',
          },
        });
      }

      return new Response(file, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      console.error('Server error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  },
});

console.log(`Development server running at http://localhost:${server.port}`);
console.log(`Open http://localhost:${server.port}/examples/babylon-basic/`);
