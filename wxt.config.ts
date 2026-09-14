import { defineConfig } from 'wxt';
import { resolve } from 'node:path';
import { readdir } from 'node:fs/promises';

const wasmPackages = ['@jsquash/avif', '@jsquash/jxl', '@jsquash/qoi'];

export default defineConfig({
  manifestVersion: 3,
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:publicAssets': async (wxt, files) => {
      const root = wxt.config.root;
      files.push({ absoluteSrc: resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'), relativeDest: 'ocr/worker.min.js' });
      const coreDir = resolve(root, 'node_modules/tesseract.js-core');
      for (const name of await readdir(coreDir)) {
        if (name.endsWith('-lstm.wasm.js') || name.endsWith('-lstm.wasm')) files.push({ absoluteSrc: resolve(coreDir, name), relativeDest: `ocr/${name}` });
      }
      for (const lang of ['spa', 'eng']) files.push({ absoluteSrc: resolve(root, `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`), relativeDest: `ocr/${lang}.traineddata.gz` });
    },
  },
  vite: () => ({
    optimizeDeps: {
      exclude: wasmPackages,
    },
    build: {
      // The heic-to decoder ships as a single ~3 MB chunk; expected and harmless.
      chunkSizeWarningLimit: 3500,
    },
  }),
  manifest: ({ browser }) => ({
    name: 'Omni Image Converter & Capture',
    description:
      'Convert images locally and capture selected regions of webpages in many image formats.',
    permissions: ['activeTab', 'downloads', 'storage', 'scripting', 'clipboardWrite'],
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
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
