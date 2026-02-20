import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    exclude: ['idml'],
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis',
      },
      supported: {
        bigint: true,
      },
    },
  },
  build: {
    target: ['esnext'], // 👈 build.target
    
    // rollupOptions: {
    //   plugins: [nodePolyfills()],
    // },
  },
  resolve: {
    // alias: {
    //   'process/': path.resolve(__dirname, 'node_modules/vite-plugin-node-polyfills/shims/process.js'),
    //   process: path.resolve(__dirname, 'node_modules/vite-plugin-node-polyfills/shims/process.js'),
    // }
  }
  // resolve: {
  //   alias: {
  //     buffer: 'rollup-plugin-node-polyfills/polyfills/buffer-es6',
  //     process: 'rollup-plugin-node-polyfills/polyfills/process-es6',
  //   },
  // },
});
