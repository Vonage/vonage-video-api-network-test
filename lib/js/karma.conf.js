import webpack from 'webpack';
import webpackConfig from './webpack.config.js';

export default function (config) {
  const sauceLaunchers = {
    chrome: {
      base: 'Chrome',
      flags: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    firefox: {
      base: 'Firefox',
      prefs: {
        'media.navigator.permission.disabled': true,
        'media.navigator.streams.fake': true,
        'app.update.enabled': false,
      },
    },
  };
  let browser;
  if (process.env.BROWSER === 'safari') {
    browser = process.env.BVER === 'unstable' ? 'SafariTechPreview' : 'Safari';
  } else {
    browser = process.env.BROWSER || 'chrome';
  }
  config.set({
    hostname: '127.0.0.1',
    basePath: './test',
    files: [{ pattern: '*.spec.ts'}],
    autoWatch: true,
    singleRun: true,
    frameworks: ['jasmine'],
    customLaunchers: sauceLaunchers,
    colors: true,
    browsers: [browser],
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
          test: /\.(ts|js)(x?)$/, // to allow webpack to pass sourcemap if the file is ts or js.
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
      ignoreSkipped: true, // Ignores skipped tests in the output
    }
  });
}
