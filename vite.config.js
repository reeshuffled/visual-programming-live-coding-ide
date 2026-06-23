import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
  },
});
