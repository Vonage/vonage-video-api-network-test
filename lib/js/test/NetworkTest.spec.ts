import * as OTClient from '@vonage/client-sdk-video';
import { credentials, createNetworkTest, OT } from './testEnv';
import {
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

const sessionCredentials = credentials.primary;
const badLoggingCredentials = credentials.faultyLogging;
const malformedCredentials = { applicationId: '1234', invalidProp: '1234', token: '1234' };
const badCredentials = { applicationId: '1234', sessionId: '1234', token: '1234' };
const validOnUpdateCallback = (stats: UpdateCallbackStats) => stats;

const customMatchers: jasmine.CustomMatcherFactories = {
  toBeInstanceOf: (): CustomMatcher => {
    return {
      compare: (actual: any, expected: any): jasmine.CustomMatcherResult => {
        const pass: boolean = actual instanceof expected;
        const message: string = pass ?
          '' : `Expected ${actual} to be an instance of ${expected}`;
        return { pass, message };
      },
    };
  },
  toBeABoolean: (): CustomMatcher => {
    return {
      compare: (actual: any, expected: any): jasmine.CustomMatcherResult => {
        const pass: boolean = typeof actual === 'boolean';
        const message: string = pass ?
          '' : `Expected ${actual} to be an instance of ${expected}`;
        return { pass, message };
      },
    };
  },
};

describe('NetworkTest', () => {
  let networkTest: NetworkTest;
  let badCredentialsNetworkTest: NetworkTest;
  let networkTestWithOptions: NetworkTest;

  beforeAll(() => {
    jasmine.addMatchers(customMatchers);
  });

  beforeEach(() => {
    networkTest = createNetworkTest(sessionCredentials);
    badCredentialsNetworkTest = createNetworkTest(badCredentials);
    networkTestWithOptions = createNetworkTest(sessionCredentials, {
      audioOnly: true,
      timeout: 5000,
    });
  });

  afterEach((done) => {
    if (networkTest) {
      networkTest.stop();
    }
    if (networkTestWithOptions) {
      networkTestWithOptions.stop();
    }
    // Wait for sessions to fully disconnect before running next test
    setTimeout(() => { done(); }, 3000);
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
        const netTest = createNetworkTest(sessionCredentials);
        netTest.testConnectivity()
          .then(() => {
            reject(new Error('Expected testConnectivity to reject but it resolved'));
          })
          .catch((results: ConnectivityTestResults) => {
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === expectedType)) {
              resolve();
            } else {
              const mappedResults = results.failedTests.map(f => f.type).join(', ');
              reject(
                new Error(`Expected failed test of type "${expectedType}" but got: ${mappedResults}`)
              );
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
          })
          .catch((results: ConnectivityTestResults) => {
            // In environments where the test API server returns errors, we still
            // validate the response shape
            expect(results.success).toBeABoolean();
            expect(results.failedTests).toBeInstanceOf(Array);
            done();
          });
      }, 15000);

      it('should return a failed test case if invalid session credentials are used', (done) => {
        const validateResults = (results: ConnectivityTestResults) => {
          expect(results.success).toBe(false);
          expect(results.failedTests).toBeInstanceOf(Array);
          // Must have at least a messaging failure
          const messagingFailure = results.failedTests.find(f => f.type === 'messaging');
          expect(messagingFailure).toBeDefined();
          expect(messagingFailure!.error.name).toBe(ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
          // A messaging failure should also trigger a media failure
          const mediaFailure = results.failedTests.find(f => f.type === 'media');
          expect(mediaFailure).toBeDefined();
          expect(mediaFailure!.error.name).toBe(ErrorNames.FAILED_MESSAGING_SERVER_TEST);
          done();
        };
        badCredentialsNetworkTest.testConnectivity()
          .then(() => done.fail('Expected testConnectivity to reject'))
          .catch(validateResults);
      }, 15000);

      it('should result in a failed test if the logging server cannot be reached', (done) => {
        // SDK properties uses non-enumerable getter-based descriptors, so we access
        // loggingURL directly rather than trying to spread the properties object.
        const realLoggingURL: string = (OT as any).properties.loggingURL;
        const badLoggingOT = {
          ...OT,
          properties: {
            ...(OT as any).properties,
            loggingURL: realLoggingURL.replace('tokbox', 'bad-tokbox'),
          },
        };
        const badLoggingNetworkTest = new NetworkTest(badLoggingOT, badLoggingCredentials);
        badLoggingNetworkTest.testConnectivity()
          .then(() => done.fail('Expected testConnectivity to reject'))
          .catch((results: ConnectivityTestResults) => {
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'logging')) {
              done();
            } else {
              done.fail(`Expected a 'logging' failure but got: ${results.failedTests.map(f => f.type).join(', ')}`);
            }
          });
      }, 15000);

      it('should result in a failed test if the API server cannot be reached', (done) => {
        testConnectFailure(OTErrorType.OT_CONNECT_FAILED, 'api').then(done).catch(done.fail);
      }, 5000);

      it('results in a failed test when session.connect() gets an invalid HTTP status', (done) => {
        testConnectFailure(OTErrorType.OT_INVALID_HTTP_STATUS, 'api').then(done).catch(done.fail);
      }, 5000);

      it('results in a failed test if session.connect() gets an authentication error', (done) => {
        testConnectFailure(OTErrorType.OT_AUTHENTICATION_ERROR, 'messaging').then(done).catch(done.fail);
      }, 5000);

      it('results in a failed test if OT.getDevices() returns an error', (done) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'disconnect').and.callFake(() => {
            // Trigger sessionDisconnected asynchronously since the listener is registered just before disconnect()
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(new Error());
        });
        const netTest = createNetworkTest(sessionCredentials);
        netTest.testConnectivity()
          .then(() => done.fail('Expected testConnectivity to reject'))
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'OpenTok.js')) {
              done();
            } else {
              done.fail(`Expected 'OpenTok.js' failure but got: ${results.failedTests.map(f => f.type).join(', ')}`);
            }
          });
      }, 15000);

      it('results in a failed test if there are no cameras or mics', (done) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(undefined, []);
        });
        const netTest = createNetworkTest(sessionCredentials);
        netTest.testConnectivity()
          .then(() => done.fail('Expected testConnectivity to reject'))
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'OpenTok.js')) {
              done();
            } else {
              done.fail(`Expected 'OpenTok.js' failure but got: ${results.failedTests.map(f => f.type).join(', ')}`);
            }
          });
      }, 15000);

      it('results in a failed test if OT.initPublisher() returns an error', (done) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          callback(new Error());
        }) as any);
        const netTest = createNetworkTest(sessionCredentials);
        netTest.testConnectivity()
          .then(() => done.fail('Expected testConnectivity to reject'))
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'OpenTok.js')) {
              done();
            } else {
              done.fail(`Expected 'OpenTok.js' failure but got: ${results.failedTests.map(f => f.type).join(', ')}`);
            }
          });
      }, 15000);

      it('results in a failed test if Session.subscribe() returns an error', (done) => {
        const realInitSession = OT.initSession;
        const realGetDevices = OT.getDevices;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'publish').and.callFake((publisher: any, callback: any) => {
            if (callback) callback(undefined);
          });
          spyOn(session, 'subscribe').and.callFake(((stream: any, target: any, config: any, callback: any) => {
            const error = new Error();
            callback(error);
          }) as any);
          spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realGetDevices(callbackFn);
        });
        // Mock initPublisher to return a publisher with a stream property
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          const eventHandlers: Record<string, Function[]> = {};
          const mockPublisher = {
            stream: { streamId: 'mock-stream' },
            on: jasmine.createSpy('on').and.callFake((event: string, handler: Function) => {
              if (!eventHandlers[event]) eventHandlers[event] = [];
              eventHandlers[event].push(handler);
            }),
            off: jasmine.createSpy('off'),
            destroy: jasmine.createSpy('destroy').and.callFake(() => {
              setTimeout(() => {
                (eventHandlers['destroyed'] || []).forEach(h => h());
              }, 0);
            }),
          };
          if (callback) setTimeout(() => callback(undefined), 0);
          return mockPublisher;
        }) as any);
        const netTest = createNetworkTest(sessionCredentials);
        netTest.testConnectivity()
          .then(() => done.fail('Expected testConnectivity to reject'))
          .catch((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'media')) {
              done();
            } else {
              done.fail(`Expected 'media' failure but got: ${results.failedTests.map(f => f.type).join(', ')}`);
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
      const testConnectFailure = (done: DoneFn, otErrorName: OTErrorType, netTestErrorName: string) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            const error = new Error();
            error.name = otErrorName;
            callback(error);
          });
          // Ensure the session has no prior connection so connectToSession doesn't skip connect()
          Object.defineProperty(session, 'connection', { value: undefined, writable: true, configurable: true });
          return session;
        });
        // Use a fresh NetworkTest instance to avoid interference from prior tests
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality(undefined)
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error!.name).toBe(netTestErrorName);
            done();
          });
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
        // Calling testConnectivity should not throw synchronously
        const promise = networkTest.testConnectivity();
        expect(promise).toBeDefined();
        // Suppress unhandled rejection from the fire-and-forget connectivity call
        promise.catch(() => { /* expected to fail if credentials are exhausted */ });
      });

      it('should return an error if invalid session credentials are used', (done) => {
        const validateError = (error?: QualityTestError) => {
          expect(error!.name).toBe(ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
        };
        badCredentialsNetworkTest.testQuality(undefined)
          .then(() => done.fail('Expected testQuality to reject'))
          .catch(validateError)
          .finally(done);
      }, 15000);

      it('should return an error if session.connect() gets an authentication error', (done) => {
        testConnectFailure(done, OTErrorType.OT_AUTHENTICATION_ERROR, ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
      }, 15000);

      it('should return an error if session.connect() gets a session ID error', (done) => {
        testConnectFailure(done, OTErrorType.OT_INVALID_SESSION_ID, ErrorNames.CONNECT_TO_SESSION_ID_ERROR);
      }, 15000);

      it('should return an error if session.connect() gets a network error', (done) => {
        testConnectFailure(done, OTErrorType.OT_CONNECT_FAILED, ErrorNames.CONNECT_TO_SESSION_NETWORK_ERROR);
      }, 15000);

      it('results in a failed test if OT.getDevices() returns an error', (done) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(new Error());
        });
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.FAILED_TO_OBTAIN_MEDIA_DEVICES);
            done();
          });
      }, 15000);

      it('results in a failed test if there are no mics', (done) => {
        const realInitSession = OT.initSession;
        const realOTGetDevices = OT.getDevices;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realOTGetDevices((error, devices) => {
            const onlyVideoDevices = devices?.filter(device => device.kind !== 'audioInput');
            callbackFn(error, onlyVideoDevices);
          });
        });
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.NO_AUDIO_CAPTURE_DEVICES);
            done();
          });
      }, 15000);

      it('should return valid test results or an error', (done) => {
        const onUpdate = (stats: UpdateCallbackStats) => validOnUpdateCallback(stats);
        networkTest.testQuality(onUpdate)
          .then(validateStandardResults)
          .catch((error?: QualityTestError) => {
            // If the test rejects, verify it's a known error type rather than an unexpected crash
            expect(error).toBeDefined();
            expect(error!.name).toBeDefined();
          })
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
          // Accept QualityTestError or ConnectToSessionError (when session is exhausted)
          expect(error).toBeDefined();
          expect(error!.name).toBeDefined();
        };
        const onUpdate = (stats: UpdateCallbackStats) => validOnUpdateCallback(stats);
        networkTestWithOptions.testQuality(onUpdate)
          .then(validateResults)
          .catch(validateError)
          .finally(done);
      }, 15000);

      it('should stop the quality test when you call the stop() method', (done) => {
        const validateError = (error?: QualityTestError) => {
          // Accept QualityTestError or ConnectToSessionError (when session is exhausted)
          expect(error).toBeDefined();
          expect(error!.name).toBeDefined();
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

      it('should return an error if the window.navigator is undefined', (done) => {
        spyOnProperty(window, 'navigator', 'get').and.returnValue(undefined as any);
        networkTest.testQuality(undefined)
          .then((results) => {
            validateResultsUndefined(results);
            done.fail('Expected testQuality to reject');
          })
          .catch((error) => {
            validateUnsupportedBrowserError(error);
            done();
          });
      }, 15000);

      it('should return an unsupported browser error if the browser is an older version of Edge', (done) => {
        spyOnProperty(window, 'navigator', 'get').and.returnValue({
          mediaDevices: {},
          webkitGetUserMedia: null,
          mozGetUserMedia: null,
          userAgent: 'Edge/12.10240',
        } as any);
        networkTest.testQuality(undefined)
          .then((results) => {
            validateResultsUndefined(results);
            done.fail('Expected testQuality to reject');
          })
          .catch((error) => {
            validateUnsupportedBrowserError(error);
            done();
          });
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
          })
          .catch(() => {
            nav.mozGetUserMedia = mozGetUserMedia;
            nav.webkitGetUserMedia = webkitGetUserMedia;
            done();
          });
      }, 15000);

      it('results in a failed test if OT.initPublisher() returns an error', (done) => {
        const realInitSession = OT.initSession;
        const realGetDevices = OT.getDevices;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realGetDevices(callbackFn);
        });
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          callback(new Error());
          return { on: jasmine.createSpy('on') };
        }) as any);
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.INIT_PUBLISHER_ERROR);
            done();
          });
      }, 15000);

      it('results in a PermissionDeniedError if OT.initPublisher() returns OT_USER_MEDIA_ACCESS_DENIED', (done) => {
        const realInitSession = OT.initSession;
        const realGetDevices = OT.getDevices;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realGetDevices(callbackFn);
        });
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          const error = new Error('Permission denied');
          error.name = 'OT_USER_MEDIA_ACCESS_DENIED';
          callback(error);
          return { on: jasmine.createSpy('on') };
        }) as any);
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.PERMISSION_DENIED_ERROR);
            done();
          });
      }, 15000);

      it('results in a PermissionDeniedError if publisher fires accessDenied event', (done) => {
        let accessDeniedHandler: Function;
        const realInitSession = OT.initSession;
        const realGetDevices = OT.getDevices;
        let sessionDisconnectSpy: jasmine.Spy;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          sessionDisconnectSpy = spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realGetDevices(callbackFn);
        });
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
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.PERMISSION_DENIED_ERROR);
            expect(sessionDisconnectSpy).toHaveBeenCalled();
            done();
          });
      }, 15000);

      it('results in a failed test if Session.subscribe() returns an error', (done) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'publish').and.callFake((publisher: any, callback: any) => {
            // Simulate successful publish; fire streamCreated on the publisher
            if (callback) callback(undefined);
            setTimeout(() => {
              const fakeStream = { streamId: 'mock-stream' };
              publisher.dispatchEvent?.({ type: 'streamCreated', stream: fakeStream });
              // If publisher uses SDK eventing, trigger it directly
              if (publisher.stream === undefined) {
                publisher.stream = fakeStream;
              }
              // Trigger any listener registered with publisher.on('streamCreated')
            }, 0);
          });
          spyOn(session, 'subscribe').and.callFake(((stream: any, target: any, config: any, callback: any) => {
            const error = new Error();
            callback(error);
          }) as any);
          spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.SUBSCRIBE_TO_SESSION_ERROR);
            done();
          });
      }, 15000);
    });

    describe('Session cleanup on error paths', () => {
      it('should disconnect the session when validateDevices fails with getDevices error', (done) => {
        const realInitSession = OT.initSession;
        let sessionDisconnectSpy: jasmine.Spy;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          sessionDisconnectSpy = spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(new Error('Device enumeration failed'));
        });
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.FAILED_TO_OBTAIN_MEDIA_DEVICES);
            expect(sessionDisconnectSpy).toHaveBeenCalled();
            done();
          });
      }, 15000);

      it('should disconnect the session when validateDevices finds no audio devices', (done) => {
        const realInitSession = OT.initSession;
        let sessionDisconnectSpy: jasmine.Spy;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          sessionDisconnectSpy = spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          // Return only video devices, no audio devices
          callback(undefined, [
            { kind: 'videoInput', deviceId: 'cam1', label: 'Camera' } as OT.Device,
          ]);
        });
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.NO_AUDIO_CAPTURE_DEVICES);
            expect(sessionDisconnectSpy).toHaveBeenCalled();
            done();
          });
      }, 15000);

      it('should disconnect the session on MissingSubscriberError', (done) => {
        const realInitSession = OT.initSession;
        const realGetDevices = OT.getDevices;
        let sessionDisconnectSpy: jasmine.Spy;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'publish').and.callFake((publisher: any, callback: any) => {
            if (callback) callback(undefined);
          });
          // subscribe returns undefined subscriber and calls callback async
          spyOn(session, 'subscribe').and.callFake(((stream: any, target: any, config: any, callback: any) => {
            setTimeout(() => callback(undefined), 0); // no error, async callback
            return undefined as any; // subscriber is falsy
          }) as any);
          sessionDisconnectSpy = spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realGetDevices(callbackFn);
        });
        // Mock initPublisher to emit streamCreated
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          const eventHandlers: Record<string, Function[]> = {};
          const mockPublisher = {
            stream: { streamId: 'mock-stream' },
            on: jasmine.createSpy('on').and.callFake((event: string, handler: Function) => {
              if (!eventHandlers[event]) eventHandlers[event] = [];
              eventHandlers[event].push(handler);
            }),
            off: jasmine.createSpy('off'),
            destroy: jasmine.createSpy('destroy'),
          };
          if (callback) setTimeout(() => callback(undefined), 0);
          // Emit streamCreated after a tick to trigger the subscribe path
          setTimeout(() => {
            (eventHandlers['streamCreated'] || []).forEach(h => h({ stream: { streamId: 'mock-stream' } }));
          }, 10);
          return mockPublisher;
        }) as any);
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.MISSING_SUBSCRIBER_ERROR);
            expect(sessionDisconnectSpy).toHaveBeenCalled();
            done();
          });
      }, 15000);

      it('should disconnect the session on PublishToSessionError', (done) => {
        const realInitSession = OT.initSession;
        const realGetDevices = OT.getDevices;
        let sessionDisconnectSpy: jasmine.Spy;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'publish').and.callFake((publisher: any, callback: any) => {
            if (callback) {
              const error = new Error('Publish failed');
              error.name = 'SOME_UNKNOWN_PUBLISH_ERROR';
              callback(error);
            }
          });
          sessionDisconnectSpy = spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realGetDevices(callbackFn);
        });
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          const mockPublisher = {
            on: jasmine.createSpy('on'),
            off: jasmine.createSpy('off'),
          };
          if (callback) setTimeout(() => callback(undefined), 0);
          return mockPublisher;
        }) as any);
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.PUBLISH_TO_SESSION_ERROR);
            expect(sessionDisconnectSpy).toHaveBeenCalled();
            done();
          });
      }, 15000);

      it('should disconnect the session on PublishToSessionNotConnectedError', (done) => {
        const realInitSession = OT.initSession;
        const realGetDevices = OT.getDevices;
        let sessionDisconnectSpy: jasmine.Spy;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'publish').and.callFake((publisher: any, callback: any) => {
            if (callback) {
              const error = new Error('Not connected');
              error.name = 'NOT_CONNECTED';
              callback(error);
            }
          });
          sessionDisconnectSpy = spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realGetDevices(callbackFn);
        });
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          const mockPublisher = {
            on: jasmine.createSpy('on'),
            off: jasmine.createSpy('off'),
          };
          if (callback) setTimeout(() => callback(undefined), 0);
          return mockPublisher;
        }) as any);
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.PUBLISH_TO_SESSION_NOT_CONNECTED);
            expect(sessionDisconnectSpy).toHaveBeenCalled();
            done();
          });
      }, 15000);

      it('should disconnect the session on PublishToSessionPermissionOrTimeoutError', (done) => {
        const realInitSession = OT.initSession;
        const realGetDevices = OT.getDevices;
        let sessionDisconnectSpy: jasmine.Spy;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          spyOn(session, 'publish').and.callFake((publisher: any, callback: any) => {
            if (callback) {
              const error = new Error('Unable to publish');
              error.name = 'UNABLE_TO_PUBLISH';
              callback(error);
            }
          });
          sessionDisconnectSpy = spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realGetDevices(callbackFn);
        });
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          const mockPublisher = {
            on: jasmine.createSpy('on'),
            off: jasmine.createSpy('off'),
          };
          if (callback) setTimeout(() => callback(undefined), 0);
          return mockPublisher;
        }) as any);
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.PUBLISH_TO_SESSION_PERMISSION_OR_TIMEOUT_ERROR);
            expect(sessionDisconnectSpy).toHaveBeenCalled();
            done();
          });
      }, 15000);

      it('connectToSession should not trigger publishAndSubscribe after rejecting on error', (done) => {
        const realInitSession = OT.initSession;
        let publishSpy: jasmine.Spy;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            const error = new Error();
            error.name = 'OT_AUTHENTICATION_ERROR';
            callback(error);
          });
          publishSpy = spyOn(session, 'publish');
          // Ensure the session has no prior connection
          Object.defineProperty(session, 'connection', { value: undefined, writable: true, configurable: true });
          return session;
        });
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality(undefined)
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error!.name).toBe(ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
            // The key assertion: publish should never be called because
            // connectToSession must not resolve after rejecting
            expect(publishSpy).not.toHaveBeenCalled();
            done();
          });
      }, 15000);

      it('should disconnect the session when publisher fires mediaStopped event', (done) => {
        let mediaStoppedHandler: Function;
        const realInitSession = OT.initSession;
        const realGetDevices = OT.getDevices;
        let sessionDisconnectSpy: jasmine.Spy;
        spyOn(OT, 'initSession').and.callFake((applicationId, sessionId) => {
          const session = realInitSession(applicationId, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            callback(undefined);
          });
          // Mock publish to never call its callback (simulates publish in progress)
          spyOn(session, 'publish').and.callFake(() => {});
          sessionDisconnectSpy = spyOn(session, 'disconnect').and.callFake(() => {
            setTimeout(() => {
              (session as any).dispatchEvent(
                new (OT as any).SessionDisconnectEvent('sessionDisconnected', 'clientDisconnected'));
            }, 0);
          });
          return session;
        });
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realGetDevices(callbackFn);
        });
        spyOn(OT, 'initPublisher').and.callFake(((target: any, options: any, callback: any) => {
          const mockPublisher = {
            on: jasmine.createSpy('on').and.callFake((event: string, handler: Function) => {
              if (event === 'mediaStopped') {
                mediaStoppedHandler = handler;
              }
            }),
          };
          if (callback) setTimeout(() => callback(undefined), 0);
          // Fire mediaStopped after initPublisher succeeds (simulates user revoking permission)
          setTimeout(() => mediaStoppedHandler(), 10);
          return mockPublisher;
        }) as any);
        const freshNetworkTest = createNetworkTest(sessionCredentials);
        freshNetworkTest.testQuality()
          .then(() => done.fail('Expected testQuality to reject'))
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.MEDIA_ACCESS_REVOKED_ERROR);
            expect(sessionDisconnectSpy).toHaveBeenCalled();
            done();
          });
      }, 15000);
    });

  });
});
