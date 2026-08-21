import webpack from 'webpack';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpackConfig from './webpack.config.mjs';

const filename = fileURLToPath(import.meta.url);
const __dirname = dirname(filename);
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
    // Run only the ESM-specific spec — the alias points to the ESM bundle (dist/index.mjs)
    // which exposes proper named exports, so the spec uses standard `import` syntax.
    files: [{ pattern: 'dist-esm.spec.ts' }],
    autoWatch: false,
    singleRun: true,
    frameworks: ['jasmine'],

    customLaunchers,
    browsers: [activeBrowser],

    preprocessors: {
      'dist-esm.spec.ts': ['webpack', 'sourcemap'],
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
          // Points at the ESM bundle. webpack 5 handles .mjs files as ES modules
          // and preserves the named exports (default + ErrorNames, etc.).
          'network-test-dist': resolve(__dirname, 'dist/index.mjs'),
        },
      },
      devtool: 'inline-source-map',
      plugins: [
        new webpack.SourceMapDevToolPlugin({
          filename: null,
          test: /\.(ts|js|mjs)(x?)$/,
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
