import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import TerserPlugin from 'terser-webpack-plugin';

const filename = fileURLToPath(import.meta.url);
const dirName = dirname(filename);

export default {
  entry: './src/index.ts',
  devtool: 'source-map',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: false,
        }
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  output: {
    filename: 'index.js',
    path: resolve(dirName, '../../dist'),
    library: {
      name: 'OpenTokNetworkConnectivity',
      type: 'umd',
      umdNamedDefine: true,
    },
    umdNamedDefine: true,
    clean: true,
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
};
