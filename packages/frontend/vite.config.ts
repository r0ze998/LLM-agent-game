import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Rollup plugin to provide a browser-compatible shim for Node.js "crypto" module.
// @x402/extensions imports { randomBytes } from "crypto" in a server-only code path,
// but Rollup/Vite bundles it anyway. We replace it with Web Crypto API equivalent.
function nodeCryptoShim(): import('vite').Plugin {
  const SHIM_ID = '\0node-crypto-shim';
  return {
    name: 'node-crypto-shim',
    enforce: 'pre',
    resolveId(source: string) {
      if (source === 'crypto') return SHIM_ID;
    },
    load(id: string) {
      if (id === SHIM_ID) {
        return `
          export function randomBytes(size) {
            return globalThis.crypto.getRandomValues(new Uint8Array(size));
          }
          export default { randomBytes };
        `;
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), nodeCryptoShim()],
  server: {
    port: 5176,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
