import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vite.dev/config/
export default defineConfig({
  plugins: [nodePolyfills(), vue()],
  optimizeDeps: {
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
  // resolve: {
  //   alias: {
  //     buffer: 'rollup-plugin-node-polyfills/polyfills/buffer-es6',
  //     process: 'rollup-plugin-node-polyfills/polyfills/process-es6',
  //   },
  // },
});
