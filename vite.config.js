import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
    include: [
      '@codemirror/view',
      '@codemirror/state',
      '@codemirror/commands',
      '@codemirror/language',
      '@codemirror/lang-javascript',
      '@codemirror/autocomplete',
      '@codemirror/search',
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
  },
});
