import webpack from 'webpack';
import webpackConfig from './webpack.config.js';

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
        '--use-fake-device-for-media-stream'
      ],
    },
    firefox_ci: {
      base: 'FirefoxHeadless', // Uses Firefox's native headless mode
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
    basePath: './test',
    files: [{ pattern: '*.spec.ts'}],
    autoWatch: true,
    singleRun: true,
    frameworks: ['jasmine'],

    customLaunchers: customLaunchers,
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
              },
            },
          ],
        }],
      },
      resolve: webpackConfig.resolve,
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
    junitReporter: {
      outputFile: 'test_out/unit.xml',
      suite: 'unit',
    },
    sauceLabs: {
      startConnect: false,
      tunnelIdentifier: process.env.TRAVIS_JOB_NUMBER,
      username: process.env.SAUCE_USERNAME,
      accessKey: process.env.SAUCE_ACCESS_KEY,
    },
    reporters: ['mocha', 'saucelabs'],
    mochaReporter: {
      ignoreSkipped: true,
    }
  });
}
