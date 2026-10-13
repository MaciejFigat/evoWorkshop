import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const proxy = { '/ws': { target: 'ws://localhost:5191', ws: true } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5190, strictPort: true, proxy },
  preview: { port: 5190, strictPort: true, proxy },
  // Phaser alone is about 1.6 MB minified; the warning would fire on every build.
  build: { chunkSizeWarningLimit: 2000 },
});
