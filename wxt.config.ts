import { defineConfig } from 'wxt';

const wasmPackages = ['@jsquash/avif', '@jsquash/jxl', '@jsquash/qoi'];

export default defineConfig({
  manifestVersion: 3,
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    optimizeDeps: {
      exclude: wasmPackages,
    },
  }),
  manifest: ({ browser }) => ({
    name: 'Omni Image Converter & Capture',
    description:
      'Convert images locally and capture selected regions of webpages in many image formats.',
    permissions: ['activeTab', 'downloads', 'storage', 'scripting'],
    commands: {
      'capture-region': {
        suggested_key: {
          default: 'Ctrl+Shift+Period',
          mac: 'Command+Shift+Period',
        },
        description: 'Select and capture a region of the current page',
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'omni-image-converter-capture@example.local',
              strict_min_version: '128.0',
            },
          },
        }
      : {}),
  }),
});
