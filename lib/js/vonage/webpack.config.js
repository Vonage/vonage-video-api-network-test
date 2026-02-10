import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import TerserPlugin from 'terser-webpack-plugin';

const filename = fileURLToPath(import.meta.url);
const dirName = dirname(filename);

export default {
  devtool: 'source-map',
  mode: 'production',
  entry: './src/index.ts',
  context: dirName,

  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@shared': resolve(dirName, '../shared'),
      '@shared/*': resolve(dirName, '../shared/*'),
    },
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
        options: {
          configFile: resolve(dirName, 'tsconfig.json'),
          transpileOnly: true,
        },
        include: [
          resolve(dirName, 'src'),
          resolve(dirName, '../shared'),
        ],
      },
    ],
  },
  output: {
    path: resolve(dirName, '../../../dist/vonage'),
    filename: 'index.js',
    library: {
      name: 'OpenTokNetworkConnectivity',
      type: 'umd',
      umdNamedDefine: true,
    },
    globalObject: 'this',
    umdNamedDefine: true,
    clean: true,
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
};
