import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import TerserPlugin from 'terser-webpack-plugin';

const filename = fileURLToPath(import.meta.url);
const dirName = dirname(filename);

const sharedConfig = {
  entry: './src/index.ts',
  devtool: 'source-map',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          // Disable full type-checking in the webpack pass:
          // - prevents TS6059 when karma compiles test files outside ./src
          // - declaration files are emitted exclusively by the tsc build:types step
          transpileOnly: true,
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
};

// UMD bundle — browser <script> tags, AMD loaders, and require() in Node.js.
// Sets globalThis.OpenTokNetworkConnectivity when loaded directly in a browser.
const umdConfig = {
  ...sharedConfig,
  output: {
    filename: 'index.js',
    path: resolve(dirName, 'dist'),
    library: {
      name: 'OpenTokNetworkConnectivity',
      type: 'umd',
      umdNamedDefine: true,
    },
    umdNamedDefine: true,
    clean: true,
  },
};

// ESM bundle — native ES modules for Node.js ESM and modern bundlers (Vite, Rollup, webpack 5).
// Consumers using `import` resolve here via the `exports.import` condition in package.json.
const esmConfig = {
  ...sharedConfig,
  experiments: { outputModule: true },
  output: {
    filename: 'index.mjs',
    path: resolve(dirName, 'dist'),
    library: {
      type: 'module',
    },
    clean: false, // UMD config already cleaned dist/
  },
};

export default [umdConfig, esmConfig];
