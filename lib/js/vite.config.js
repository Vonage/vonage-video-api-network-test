import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    // This plugin generates the .d.ts files for your libraries
    dts({ 
      insertTypesEntry: true,
      include: ['lib/js'] 
    })
  ],
  build: {
    lib: {
      // Point these to your actual TypeScript entry files
      entry: {
        opentok: resolve(__dirname, 'opentok/src/index.ts'),
        vonage: resolve(__dirname, 'vonage/src/index.ts')
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format}.js`
    },
    outDir: 'dist',
    // Ensures that shared code is bundled correctly
    rollupOptions: {
      external: [], // Add peer dependencies here if necessary
    }
  }
});