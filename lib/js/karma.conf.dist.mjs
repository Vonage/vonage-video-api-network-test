import webpack from 'webpack';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpackConfig from './webpack.config.mjs';

const filename = fileURLToPath(import.meta.url);
const __dirname = dirname(filename);
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

const [umdConfig] = webpackConfig;

export default function (config) {
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  const customLaunchers = {
    chrome_local: {
      base: 'Chrome',
      flags: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    firefox_local: {
      base: 'Firefox',
      prefs: {
        'media.navigator.permission.disabled': true,
        'media.navigator.streams.fake': true,
        'app.update.enabled': false,
      },
    },

    chrome_ci: {
      base: 'ChromeHeadless',
      flags: [
        '--no-sandbox',
        '--disable-gpu',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
    firefox_ci: {
      base: 'FirefoxHeadless',
      prefs: {
        'media.navigator.permission.disabled': true,
        'media.navigator.streams.fake': true,
        'app.update.enabled': false,
      },
    },
  };

  let requestedBrowser = process.env.BROWSER || 'chrome';
  let activeBrowser;

  if (requestedBrowser === 'safari') {
    activeBrowser = process.env.BVER === 'unstable' ? 'SafariTechPreview' : 'Safari';
  } else if (requestedBrowser === 'firefox') {
    activeBrowser = isGitHubActions ? 'firefox_ci' : 'firefox_local';
  } else {
    activeBrowser = isGitHubActions ? 'chrome_ci' : 'chrome_local';
  }

  config.set({
    hostname: '127.0.0.1',
    basePath: './test/dist-tests',
    files: [{ pattern: '*.spec.ts' }],
    autoWatch: false,
    singleRun: true,
    frameworks: ['jasmine'],

    customLaunchers,
    browsers: [activeBrowser],

    preprocessors: {
      '*.spec.ts': ['webpack', 'sourcemap'],
    },
    webpack: {
      module: {
        rules: [{
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                compilerOptions: {
                  rootDir: __dirname,
                },
              },
            },
          ],
        }],
      },
      resolve: {
        ...umdConfig.resolve,
        alias: {
          'network-test-dist': resolve(__dirname, pkg.main),
        },
      },
      devtool: 'inline-source-map',
      plugins: [
        new webpack.SourceMapDevToolPlugin({
          filename: null,
          test: /\.(ts|js)(x?)$/,
        }),
      ],
    },
    webpackMiddleware: {
      stats: 'errors-only',
    },
    mime: {
      'text/x-typescript': ['ts'],
    },
    reporters: ['mocha'],
    mochaReporter: {
      ignoreSkipped: true,
    },
  });
}
