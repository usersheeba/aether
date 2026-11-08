import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(() => {
  const hmrDisabled = process.env.DISABLE_HMR === 'true';

  return {
    plugins: [react(), tailwindcss()],
    build: {
      // The workspace chunk carries ProseMirror + TipTap (~513 kB) and is
      // lazy-loaded, so the default 500 kB notice is just noise here.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        input: {
          app: resolve(rootDir, 'index.html'),
          'design-playground': resolve(rootDir, 'design-playground.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: !hmrDisabled,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: hmrDisabled ? null : {},
    },
  };
});
