import * as OTClient from '@vonage/client-sdk-video';
import {
  primary as sessionCredentials,
  faultyLogging as badLoggingCredentials,
} from './credentials.json';
import {
  NetworkTestError,
  MissingOpenTokInstanceError,
  MissingSessionCredentialsError,
  IncompleteSessionCredentialsError,
  InvalidOnUpdateCallback,
} from '../src/errors';
import { OTErrorType } from '../src/errors/types';
import NetworkTest, { ErrorNames, QualityTestResults } from '../src';
import { ConnectivityTestResults } from '../src/testConnectivity/index';
import { QualityTestError } from '../src/testQuality/errors/index';
import { UpdateCallbackStats } from '../src/types/callbacks';

type CustomMatcher = jasmine.CustomMatcher;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jasmine {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<T> {
      toBeABoolean(): boolean;
      toBeInstanceOf(expected: any): boolean;
    }
  }
}

const malformedCredentials = { applicationId: '1234', invalidProp: '1234', token: '1234' };
const badCredentials = { applicationId: '1234', sessionId: '1234', token: '1234' };
const networkTest = new NetworkTest(OTClient, sessionCredentials);
const networkTestWithOptions = new NetworkTest(OTClient, sessionCredentials, {
  audioOnly: true,
  timeout: 5000,
});
const badCredentialsNetworkTest = new NetworkTest(OTClient, badCredentials);
const validOnUpdateCallback = (stats: UpdateCallbackStats) => stats;

const customMatchers: jasmine.CustomMatcherFactories = {
  toBeInstanceOf: (): CustomMatcher => {
    return {
      compare: (actual: any, expected: any): jasmine.CustomMatcherResult => {
        const pass: boolean = actual instanceof expected;
        const message: string = pass ? '' : `Expected ${actual} to be an instance of ${expected}`;
        return { pass, message };
      },
    };
  },
  toBeABoolean: (): CustomMatcher => {
    return {
      compare: (actual: any, expected: any): jasmine.CustomMatcherResult => {
        const pass: boolean = typeof actual === 'boolean';
        const message: string = pass ? '' : `Expected ${actual} to be an instance of ${expected}`;
        return { pass, message };
      },
    };
  },
};

describe('NetworkTest', () => {

  beforeAll(() => {
    jasmine.addMatchers(customMatchers);
  });

  afterEach((done) => {
    if (networkTest) {
      networkTest.stop();
    }
    // A bit of a hack. But this prevents tests from failing if a previous test's Session didn't disconnect:
    setTimeout(() => { done(); }, 1000);
  });

  it('its constructor requires OT and valid session credentials', () => {
    // @ts-expect-error testing runtime validation with wrong number of args
    expect(() => new NetworkTest(sessionCredentials as any)).toThrow(new MissingOpenTokInstanceError());
    expect(() => new NetworkTest({} as any, sessionCredentials)).toThrow(new MissingOpenTokInstanceError());
    // @ts-expect-error testing runtime validation with wrong number of args
    expect(() => new NetworkTest(OTClient as any)).toThrow(new MissingSessionCredentialsError());
    expect(() => new NetworkTest(OTClient, malformedCredentials as any))
      .toThrow(new IncompleteSessionCredentialsError());
    expect(new NetworkTest(OTClient, sessionCredentials)).toBeInstanceOf(NetworkTest);
  });

  it('it contains a valid ErrorNames module', () => {
    expect(ErrorNames.MISSING_OPENTOK_INSTANCE).toBe('MissingOpenTokInstanceError');
  });

  describe('Connectivity Test', () => {
    const testConnectFailure = (errorName: OTErrorType, expectedType: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            const error = new Error();
            error.name = errorName;
            callback(error);
          });
          return session;
        });
        const netTest = new NetworkTest(OT, sessionCredentials);
        netTest.testConnectivity()
          .catch((results: ConnectivityTestResults) => {
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === expectedType)) {
              reject();
            }
          });
      });
    };

    describe('Test Results', () => {
      it('should contain success and failedTests properties', (done) => {
        networkTest.testConnectivity()
          .then((results: ConnectivityTestResults) => {
            expect(results.success).toBeABoolean();
            expect(results.failedTests).toBeInstanceOf(Array);
            done();
          });
      }, 15000);

      it('should return a failed test case if invalid session credentials are used', () => {
        const validateResults = (results: ConnectivityTestResults) => {
          expect(results.success).toBe(false);
          expect(results.failedTests).toBeInstanceOf(Array);
          const [initialFailure, secondaryFailure] = results.failedTests;
          expect(initialFailure.type).toBe('messaging');
          expect(initialFailure.error.name).toBe(ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
          expect(secondaryFailure.type).toBe('media');
          expect(secondaryFailure.error.name).toBe(ErrorNames.FAILED_MESSAGING_SERVER_TEST);
        };

        badCredentialsNetworkTest.testConnectivity()
          .catch(validateResults);
      });

      it('should result in a failed test if the logging server cannot be reached', (done) => {
        const badLoggingOT = {
          ...OTClient,
          ...{
            properties: {
              ...(OTClient as any).properties,
              loggingURL: (OTClient as any).properties.loggingURL.replace('tokbox', 'bad-tokbox'),
            },
          },
        };
        const badLoggingNetworkTest = new NetworkTest(badLoggingOT, badLoggingCredentials);
        badLoggingNetworkTest.testConnectivity()
          .catch((results: ConnectivityTestResults) => {
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'logging')) {
              done();
            }
          });
      }, 15000);

      it('should result in a failed test if the API server cannot be reached', (done) => {
        testConnectFailure(OTErrorType.OT_CONNECT_FAILED, 'api').catch(done);
      }, 1000);

      it('results in a failed test when session.connect() gets an invalid HTTP status', (done) => {
        testConnectFailure(OTErrorType.OT_INVALID_HTTP_STATUS, 'api').catch(done);
      }, 1000);

      it('results in a failed test if session.connect() gets an authentication error', (done) => {
        testConnectFailure(OTErrorType.OT_AUTHENTICATION_ERROR, 'messaging').catch(done);
      }, 1000);

      it('results in a failed test if OT.getDevices() returns an error', (done) => {
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(new Error());
        });
        networkTest.testConnectivity()
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'OpenTok.js')) {
              done();
            }
          });
      }, 15000);
      it('results in a failed test if there are no cameras or mics', (done) => {
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(undefined, []);
        });
        networkTest.testConnectivity()
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'OpenTok.js')) {
              done();
            }
          });
      }, 15000);
      it('results in a failed test if session.connect() gets an authentication error', (done) => {
        testConnectFailure(OTErrorType.OT_AUTHENTICATION_ERROR, 'messaging').catch(done);
      }, 1000);
      it('results in a failed test if OT.initPublisher() returns an error', (done) => {
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          callback(new Error());
        }) as any);
        networkTest.testConnectivity()
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'OpenTok.js')) {
              done();
            }
          });
      }, 15000);
      it('results in a failed test if Session.subscribe() returns an error', (done) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'subscribe').and.callFake(((stream: any, target: any, config: any, callback: any) => {
            const error = new Error();
            callback(error);
          }) as any);
          return session;
        });
        networkTest.testConnectivity()
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'media')) {
              done();
            }
          });
      }, 15000);
    });

    describe('Quality Test', () => {
      const validateResultsUndefined = (results: QualityTestResults) => {
        expect(results).toBe(undefined as any);
      };

      const validateUnsupportedBrowserError = (error?: QualityTestError) => {
        expect(error!.name).toBe(ErrorNames.UNSUPPORTED_BROWSER);
      };

      const testConnectFailure = (otErrorName: OTErrorType, netTestErrorName: string) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            const error = new Error();
            error.name = otErrorName;
            callback(error);
          });
          return session;
        });

        const validateError = (error?: QualityTestError) => {
          expect(error!.name).toBe(netTestErrorName);
        };

        networkTest.testQuality(undefined)
          .catch(validateError);
      };

      const validateStandardResults = (results: QualityTestResults) => {
        const { audio, video } = results;

        expect(audio.bitrate).toEqual(jasmine.any(Number));
        expect(audio.supported).toEqual(jasmine.any(Boolean));
        expect(audio.reason || '').toEqual(jasmine.any(String));
        expect(audio.packetLossRatio).toEqual(jasmine.any(Number));
        expect(audio.mos).toEqual(jasmine.any(Number));

        expect(video.supported).toEqual(jasmine.any(Boolean));
        if (video.supported) {
          expect(video.bitrate).toEqual(jasmine.any(Number));
          expect(video.packetLossRatio).toEqual(jasmine.any(Number));
          expect(video.frameRate).toEqual(jasmine.any(Number));
          expect(video.recommendedResolution).toEqual(jasmine.any(String));
          expect(video.recommendedFrameRate).toEqual(jasmine.any(Number));
          expect(video.mos).toEqual(jasmine.any(Number));
        } else {
          expect(video.reason).toEqual(jasmine.any(String));
        }
      };

      it('validates its onUpdate callback', () => {
        expect(() => networkTest.testQuality('bad-callback' as any)).toThrow(new InvalidOnUpdateCallback());
        expect(() => networkTest.testConnectivity())
          .not.toThrowError(NetworkTestError);
      });

      it('should return an error if invalid session credentials are used', (done) => {
        const validateError = (error?: QualityTestError) => {
          expect(error!.name).toBe(ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
        };

        badCredentialsNetworkTest.testQuality(undefined)
          .catch(validateError)
          .finally(done);
      });

      it('should return an error if session.connect() gets an authentication error', () => {
        testConnectFailure(OTErrorType.OT_AUTHENTICATION_ERROR, ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
      });

      it('should return an error if session.connect() gets a session ID error', () => {
        testConnectFailure(OTErrorType.OT_INVALID_SESSION_ID, ErrorNames.CONNECT_TO_SESSION_ID_ERROR);
      });

      it('should return an error if session.connect() gets a network error', () => {
        testConnectFailure(OTErrorType.OT_CONNECT_FAILED, ErrorNames.CONNECT_TO_SESSION_NETWORK_ERROR);
      });

      it('results in a failed test if OT.getDevices() returns an error', (done) => {
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(new Error());
        });
        networkTest.testQuality()
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.FAILED_TO_OBTAIN_MEDIA_DEVICES);
            done();
          });
      }, 15000);

      it('results in a failed test if there are no mics', (done) => {
        const realOTGetDevices = OT.getDevices;
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realOTGetDevices((error, devices) => {
            const onlyVideoDevices = devices?.filter(device => device.kind !== 'audioInput');
            callbackFn(error, onlyVideoDevices);
          });
        });
        networkTest.testQuality()
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.NO_AUDIO_CAPTURE_DEVICES);
            done();
          });
      }, 15000);

      it('should return valid test results or an error', (done) => {
        const onUpdate = (stats: UpdateCallbackStats) => validOnUpdateCallback(stats);

        networkTest.testQuality(onUpdate)
          .catch(validateStandardResults)
          .finally(done);
      }, 40000);

      it('should run a valid test or error when give audiOnly and timeout options', (done) => {
        const validateResults = (results: QualityTestResults) => {
          const { audio, video } = results;

          expect(audio.bitrate).toEqual(jasmine.any(Number));
          expect(audio.supported).toEqual(jasmine.any(Boolean));
          expect(audio.reason || '').toEqual(jasmine.any(String));
          expect(audio.packetLossRatio).toEqual(jasmine.any(Number));
          expect(audio.mos).toEqual(jasmine.any(Number));

          expect(video.supported).toEqual(false);
        };

        const validateError = (error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.QUALITY_TEST_ERROR);
        };

        const onUpdate = (stats: UpdateCallbackStats) => validOnUpdateCallback(stats);

        networkTestWithOptions.testQuality(onUpdate)
          .then(validateResults)
          .catch(validateError)
          .finally(done);
      }, 15000);

      it('should stop the quality test when you call the stop() method', (done) => {
        const validateError = (error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.QUALITY_TEST_ERROR);
        };

        const onUpdate = (stats: UpdateCallbackStats) => {
          validOnUpdateCallback(stats);
          networkTest.stop(); // The test will wait for adequate stats before stopping
        };

        networkTest.testQuality(onUpdate)
          .then(validateStandardResults)
          .catch(validateError)
          .finally(done);
      }, 15000);

      it('should return valid test results or an error when there is no camera', (done) => {
        const realOTGetDevices = OT.getDevices;
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realOTGetDevices((error, devices) => {
            const onlyAudioDevices = devices?.filter(device => device.kind !== 'videoInput');
            callbackFn(error, onlyAudioDevices);
          });
        });

        const validateResults = (results: QualityTestResults) => {
          const { audio, video } = results;
          expect(audio.bitrate).toEqual(jasmine.any(Number));
          expect(audio.supported).toEqual(jasmine.any(Boolean));
          expect(audio.packetLossRatio).toEqual(jasmine.any(Number));
          expect(audio.mos).toEqual(jasmine.any(Number));

          expect(video.supported).toEqual(false);
          expect(video.reason).toEqual('No camera was found.');
        };

        const validateError = (error?: QualityTestError) => {
          expect(error).toBeInstanceOf(QualityTestError);
        };

        const onUpdate = (stats: UpdateCallbackStats) => validOnUpdateCallback(stats);

        networkTest.testQuality(onUpdate)
          .then(validateResults)
          .catch(validateError)
          .finally(done);
      }, 15000);

      it('should return an error if the window.navigator is undefined', () => {
        spyOnProperty(window, 'navigator', 'get').and.returnValue(undefined as any);
        networkTest.testQuality(undefined)
          .then(validateResultsUndefined)
          .catch(validateUnsupportedBrowserError);
      });

      it('should return an unsupported browser error if the browser is an older version of Edge', () => {
        spyOnProperty(window, 'navigator', 'get').and.returnValue({
          mediaDevices: {},
          webkitGetUserMedia: null,
          mozGetUserMedia: null,
          userAgent: 'Edge/12.10240',
        } as any);
        networkTest.testQuality(undefined)
          .then(validateResultsUndefined)
          .catch(validateUnsupportedBrowserError);
      }, 15000);

      it('should run the test if the browser is a Chromium-based version of Edge', (done) => {
        const nav = navigator as any;
        const mozGetUserMedia = nav.mozGetUserMedia;
        const webkitGetUserMedia = nav.webkitGetUserMedia;
        nav.mozGetUserMedia = null;
        nav.webkitGetUserMedia = {};
        spyOnProperty(window.navigator, 'userAgent', 'get').and.returnValue('Edg');
        networkTestWithOptions.testQuality()
          .then(() => {
            nav.mozGetUserMedia = mozGetUserMedia;
            nav.webkitGetUserMedia = webkitGetUserMedia;
            done();
          });
      }, 15000);

      it('results in a failed test if OT.initPublisher() returns an error', (done) => {
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          callback(new Error());
          return { on: jasmine.createSpy('on') };
        }) as any);
        networkTest.testQuality().catch((error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.INIT_PUBLISHER_ERROR);
          done();
        });
      }, 15000);

      it('results in a PermissionDeniedError if OT.initPublisher() returns OT_USER_MEDIA_ACCESS_DENIED', (done) => {
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          const error = new Error('Permission denied');
          error.name = 'OT_USER_MEDIA_ACCESS_DENIED';
          callback(error);
          return { on: jasmine.createSpy('on') };
        }) as any);
        networkTest.testQuality().catch((error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.PERMISSION_DENIED_ERROR);
          done();
        });
      }, 15000);

      it('results in a PermissionDeniedError if publisher fires accessDenied event', (done) => {
        let accessDeniedHandler: Function;
        spyOn(OT, 'initPublisher').and.callFake((() => {
          const mockPublisher = {
            on: jasmine.createSpy('on').and.callFake((event: string, handler: Function) => {
              if (event === 'accessDenied') {
                accessDeniedHandler = handler;
              }
            }),
          };
          // Do not call the callback — simulate SDK not invoking it on denial
          setTimeout(() => accessDeniedHandler(), 0);
          return mockPublisher;
        }) as any);
        networkTest.testQuality().catch((error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.PERMISSION_DENIED_ERROR);
          done();
        });
      }, 15000);

      it('results in a failed test if Session.subscribe() returns an error', (done) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'subscribe').and.callFake(((stream: any, target: any, config: any, callback: any) => {
            const error = new Error();
            callback(error);
          }) as any);
          return session;
        });
        networkTest.testQuality().catch((error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.SUBSCRIBE_TO_SESSION_ERROR);
          done();
        });
      }, 15000);

      it('results in a MediaAccessRevokedError if publisher fires mediaStopped event', (done) => {
        let mediaStoppedHandler: Function;
        spyOn(OT, 'initPublisher').and.callFake((() => {
          const mockPublisher = {
            on: jasmine.createSpy('on').and.callFake((event: string, handler: Function) => {
              if (event === 'mediaStopped') {
                mediaStoppedHandler = handler;
              }
            }),
          };
          // Simulate media being stopped shortly after publisher init
          setTimeout(() => mediaStoppedHandler(), 0);
          return mockPublisher;
        }) as any);
        networkTest.testQuality().catch((error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.MEDIA_ACCESS_REVOKED_ERROR);
          done();
        });
      }, 15000);

      it('results in a MediaAccessRevokedError if publisher stream is destroyed with mediaStopped reason', (done) => {
        let streamDestroyedHandler: Function;
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          const realPublish = session.publish.bind(session);
          spyOn(session, 'publish').and.callFake(((publisher: any, callback: any) => {
            // Intercept the publisher to attach streamDestroyed handler capture
            const originalOn = publisher.on.bind(publisher);
            publisher.on = (event: string, handler: Function) => {
              if (event === 'streamDestroyed') {
                streamDestroyedHandler = handler;
              }
              return originalOn(event, handler);
            };
            return realPublish(publisher, (error?: any) => {
              if (!error) {
                // Fire streamDestroyed after a brief delay to simulate mid-test failure
                setTimeout(() => {
                  if (streamDestroyedHandler) {
                    streamDestroyedHandler({ reason: 'mediaStopped' });
                  }
                }, 2000);
              }
              if (callback) callback(error);
            });
          }) as any);
          return session;
        });
        networkTest.testQuality().catch((error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.MEDIA_ACCESS_REVOKED_ERROR);
          done();
        });
      }, 20000);
    });

    describe('Connectivity Test Device Scenarios', () => {
      it('results in a PermissionDeniedError if publisher fires accessDenied during connectivity test', (done) => {
        let accessDeniedHandler: Function;
        spyOn(OT, 'initPublisher').and.callFake((() => {
          const mockPublisher = {
            on: jasmine.createSpy('on').and.callFake((event: string, handler: Function) => {
              if (event === 'accessDenied') {
                accessDeniedHandler = handler;
              }
            }),
          };
          // Simulate permission revocation after initial success
          setTimeout(() => {
            if (accessDeniedHandler) accessDeniedHandler();
          }, 0);
          return mockPublisher;
        }) as any);
        networkTest.testConnectivity()
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            const permissionFailure = results.failedTests.find(
              f => f.error.name === ErrorNames.PERMISSION_DENIED_ERROR
            );
            expect(permissionFailure).toBeDefined();
            done();
          });
      }, 15000);

      it('results in a MediaAccessRevokedError if publisher fires mediaStopped during connectivity test', (done) => {
        let mediaStoppedHandler: Function;
        spyOn(OT, 'initPublisher').and.callFake((() => {
          const mockPublisher = {
            on: jasmine.createSpy('on').and.callFake((event: string, handler: Function) => {
              if (event === 'mediaStopped') {
                mediaStoppedHandler = handler;
              }
            }),
          };
          // Do not call callback (simulates it hanging before resolve)
          setTimeout(() => {
            if (mediaStoppedHandler) mediaStoppedHandler();
          }, 0);
          return mockPublisher;
        }) as any);
        networkTest.testConnectivity()
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            const revokedFailure = results.failedTests.find(
              f => f.error.name === ErrorNames.MEDIA_ACCESS_REVOKED_ERROR
            );
            expect(revokedFailure).toBeDefined();
            done();
          });
      }, 15000);

      it('proceeds with video-only when no audio capture devices are available', (done) => {
        const realOTGetDevices = OT.getDevices;
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realOTGetDevices((error, devices) => {
            const onlyVideoDevices = devices?.filter(device => device.kind !== 'audioInput');
            callbackFn(error, onlyVideoDevices);
          });
        });
        networkTest.testConnectivity()
          .then((results: ConnectivityTestResults) => {
            expect(results.success).toBe(true);
            done();
          })
          .catch((results: ConnectivityTestResults) => {
            // Even if the test fails for other reasons (e.g., network), it should NOT
            // have failed due to NoAudioCaptureDevicesError since connectivity allows video-only.
            const audioDeviceFailure = results.failedTests.find(
              f => f.error.name === ErrorNames.NO_AUDIO_CAPTURE_DEVICES
            );
            expect(audioDeviceFailure).toBeUndefined();
            done();
          });
      }, 15000);
    });
  });
});
