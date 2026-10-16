import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Sitio 100% estático: todo se sirve desde el mismo origen (/public incluido).
export default defineConfig({
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  // Pruebas unitarias sin navegador: la lógica de imagen trabaja sobre rasters RGBA en memoria.
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
