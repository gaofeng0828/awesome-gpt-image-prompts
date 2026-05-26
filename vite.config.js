import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'data',
  base: '/awesome-gpt-image-prompts/',
  server: {
    host: '127.0.0.1'
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
