/**
 * @module Test/Connectivity
 * @preferred
 *
 * Defines the methods required for the Connectivity Test Flow
 */

/**
 * Connectivity Test Flow
 */
import axios from 'axios';
import OTKLogger from '@opentok/opentok-solutions-logging';
import {
  NetworkTestOptions,
} from '../index';
import * as e from './errors';
import { OTErrorType, errorHasName } from '../errors/types';
import { mapErrors, FailureCase } from './errors/mapping';
import { getOr } from '../util';
import { SessionCredentials, InitSessionOptions } from '../types/session';
import { PermissionDeniedError } from '../errors';

type AV = 'audio' | 'video';
type CreateLocalPublisherResults = { publisher: OT.Publisher };
type PublishToSessionResults = { session: OT.Session } & CreateLocalPublisherResults;
type SubscribeToSessionResults = { subscriber: OT.Subscriber } & PublishToSessionResults;
type DeviceMap = { [deviceId: string]: OT.Device };
type AvailableDevices = { audio: DeviceMap; video: DeviceMap };

export type ConnectivityTestResults = {
  success: boolean;
  failedTests: FailureCase[];
};

type Resources = {
  session?: OT.Session;
  publisher?: OT.Publisher;
  subscriber?: OT.Subscriber;
  publisherDiv?: HTMLElement;
  subscriberDiv?: HTMLElement;
  aborted: boolean;
  cleanup: Promise<void>;
};

const CLEANUP_TIMEOUT_MS = 3000;
const abortHooks = new Set<() => void>();
const destroyedMedia = new WeakSet<object>();

// Run a cleanup step that settles when done() is called or after a timeout, whichever comes first
function runCleanupStep(start: (done: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, CLEANUP_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timeoutId);
      resolve();
    };
    try {
      start(done);
    } catch {
      done();
    }
  });
}

/**
 * Disconnect from a session. Once disconnected, remove all session
 * event listeners and invoke the provided callback function.
 */
function disconnectFromSession(session?: OT.Session): Promise<void> {
  return runCleanupStep((done) => {
    if (!session) {
      done();
      return;
    }
    // A session that is not connected will not emit sessionDisconnected
    const isConnected = !!session.connection;
    if (isConnected) {
      session.on('sessionDisconnected', () => {
        session.off();
        done();
      });
    }
    session.disconnect();
    if (!isConnected) {
      done();
    }
  });
}

/**
 * Clean subscriber objects before disconnecting from the session
 * @param session
 * @param subscriber
 */
function cleanSubscriber(session?: OT.Session, subscriber?: OT.Subscriber): Promise<void> {
  return runCleanupStep((done) => {
    if (!session || !subscriber || destroyedMedia.has(subscriber)) {
      done();
      return;
    }
    subscriber.on('destroyed', () => {
      destroyedMedia.add(subscriber);
      done();
    });
    session.unsubscribe(subscriber);
  });
}

function cleanPublisher(publisher?: OT.Publisher): Promise<void> {
  return runCleanupStep((done) => {
    if (!publisher || destroyedMedia.has(publisher)) {
      done();
      return;
    }
    publisher.on('destroyed', () => {
      destroyedMedia.add(publisher);
      done();
    });
    publisher.destroy();
  });
}

function removeElement(element?: HTMLElement) {
  element?.parentNode?.removeChild(element);
}

/**
 * Release the subscriber, publisher and session, in that order. Safe to call more than once.
 */
function cleanupAll(resources: Resources): Promise<void> {
  const { session, publisher, subscriber, publisherDiv, subscriberDiv } = resources;
  resources.session = undefined;
  resources.publisher = undefined;
  resources.subscriber = undefined;
  resources.publisherDiv = undefined;
  resources.subscriberDiv = undefined;
  // Chain on any cleanup already in progress so callers wait for the same work
  resources.cleanup = resources.cleanup
    .then(() => cleanSubscriber(session, subscriber))
    .then(() => cleanPublisher(publisher))
    .then(() => disconnectFromSession(session))
    .then(() => {
      removeElement(publisherDiv);
      removeElement(subscriberDiv);
    })
    .catch(() => undefined);
  return resources.cleanup;
}

/**
 * Abort any connectivity tests in progress. Does nothing if none are running.
 */
export function stopConnectivityTest() {
  Array.from(abortHooks).forEach(abort => abort());
}

/**
 * Attempt to connect to the Vonage Video API session
 */
function connectToSession(
  OTInstance: typeof OT,
  { applicationId, sessionId, token }: SessionCredentials,
  resources: Resources,
  options?: NetworkTestOptions,
): Promise<OT.Session> {
  return new Promise((resolve, reject) => {
    let sessionOptions: InitSessionOptions = {};
    if (options && options.initSessionOptions) {
      sessionOptions = options.initSessionOptions;
    }
    if (options && options.proxyServerUrl) {
      // eslint-disable-next-line no-prototype-builtins
      if (!OTInstance.hasOwnProperty('setProxyUrl')) { // Fallback for OT.version < 2.17.4
        sessionOptions.proxyUrl = options.proxyServerUrl;
      }
    }
    const session = OTInstance.initSession(applicationId, sessionId, sessionOptions);
    resources.session = session;
    session.connect(token, (error?: OT.OTError) => {
      if (error) {
        // A session that failed to connect has nothing to disconnect
        resources.session = undefined;
      }
      if (errorHasName(error, OTErrorType.OT_AUTHENTICATION_ERROR)) {
        reject(new e.ConnectToSessionTokenError());
      } else if (errorHasName(error, OTErrorType.OT_INVALID_SESSION_ID)) {
        reject(new e.ConnectToSessionSessionIdError());
      } else if (errorHasName(error, OTErrorType.OT_CONNECT_FAILED)) {
        reject(new e.ConnectToSessionNetworkError());
      } else if (errorHasName(error, OTErrorType.OT_INVALID_HTTP_STATUS)) {
        reject(new e.APIConnectivityError());
      } else if (error) {
        reject(new e.ConnectToSessionError());
      } else {
        resolve(session);
      }
    });
  });
}

/**
 * Ensure that audio and video devices are available
 */
function validateDevices(OTInstance: typeof OT): Promise<AvailableDevices> {
  return new Promise((resolve, reject) => {
    OTInstance.getDevices((error?: OT.OTError, devices: OT.Device[] = []) => {

      if (error) {
        reject(new e.FailedToObtainMediaDevices());
      } else {

        const availableDevices: AvailableDevices = devices.reduce(
          (acc: AvailableDevices, device: OT.Device) => {
            const type: AV = device.kind === 'audioInput' ? 'audio' : 'video';
            return { ...acc, [type]: { ...acc[type], [device.deviceId]: device } };
          },
          { audio: {}, video: {} },
        );

        if (!Object.keys(availableDevices.audio).length && !Object.keys(availableDevices.video).length) {
          reject(new e.FailedToObtainMediaDevices());
        } else {
          resolve(availableDevices);
        }
      }
    });
  });
}

/**
 * Create a local publisher object using any specified device options
 */
function checkCreateLocalPublisher(
  OTInstance: typeof OT,
  resources: Resources,
  options?: NetworkTestOptions,
): Promise<CreateLocalPublisherResults> {
  return new Promise((resolve, reject) => {
    validateDevices(OTInstance)
      .then((availableDevices: AvailableDevices) => {
        if (resources.aborted) {
          throw new e.ConnectivityTestAbortedError();
        }
        const publisherDiv = document.createElement('div');
        publisherDiv.style.position = 'fixed';
        publisherDiv.style.bottom = '-1px';
        publisherDiv.style.width = '1px';
        publisherDiv.style.height = '1px';
        publisherDiv.style.opacity = '0.01';
        document.body.appendChild(publisherDiv);
        resources.publisherDiv = publisherDiv;
        const publisherOptions: OT.PublisherProperties = {
          width: '100%',
          height: '100%',
          insertMode: 'append',
          showControls: false,
          scalableVideo: false,
        };
        if (options && options.audioSource) {
          publisherOptions.audioSource = options.audioSource;
        }
        if (options && options.videoSource) {
          publisherOptions.videoSource = options.videoSource;
        }
        if (options && options.audioOnly) {
          publisherOptions.videoSource = null;
        }
        if (!Object.keys(availableDevices.audio).length) {
          publisherOptions.audioSource = null;
        }
        if (!Object.keys(availableDevices.video).length) {
          publisherOptions.videoSource = null;
        }
        if (options && options.scalableVideo) {
          publisherOptions.scalableVideo = options.scalableVideo;
        }
        let initFailed = false;
        const publisher = OTInstance.initPublisher(publisherDiv, publisherOptions, (error?: OT.OTError) => {
          if (!error) {
            resolve({ publisher });
          } else {
            initFailed = true;
            // Clean up the DOM element
            publisherDiv.parentNode?.removeChild(publisherDiv);

            // Release whatever the failed publisher may still hold
            const failedPublisher = resources.publisher;
            resources.publisher = undefined;
            try {
              failedPublisher?.destroy();
            } catch {
              // Nothing left to release
            }

            if (error && (error.name === 'OT_USER_MEDIA_ACCESS_DENIED' ||
                (error.message && (error.message.toLowerCase().includes('permission') ||
                error.message.toLowerCase().includes('access denied') ||
                error.message.toLowerCase().includes('not allowed'))))) {
              reject(new PermissionDeniedError());
            } else {
              reject(new e.FailedToCreateLocalPublisher());
            }
          }
        });
        if (!initFailed) {
          resources.publisher = publisher;
        }
        publisher.on('streamCreated', () => {
          publisherDiv.style.visibility = 'hidden';
        });
      })
      .catch(reject);
  });
}

/**
 * Attempt to publish to the session
 */
function checkPublishToSession(
  OTInstance: typeof OT, session: OT.Session,
  resources: Resources,
  options?: NetworkTestOptions,
): Promise<PublishToSessionResults> {
  return new Promise((resolve, reject) => {
    const disconnectAndReject = (rejectError: Error) => {
      cleanupAll(resources).then(() => {
        reject(rejectError);
      });
    };
    checkCreateLocalPublisher(OTInstance, resources, options)
      .then(({ publisher }: CreateLocalPublisherResults) => {
        if (resources.aborted) {
          throw new e.ConnectivityTestAbortedError();
        }
        session.publish(publisher, (error?: OT.OTError) => {
          if (error) {
            if (errorHasName(error, OTErrorType.NOT_CONNECTED)) {
              disconnectAndReject(new e.PublishToSessionNotConnectedError());
            } else if (errorHasName(error, OTErrorType.UNABLE_TO_PUBLISH)) {
              disconnectAndReject(
                new e.PublishToSessionPermissionOrTimeoutError());
            } else if (error) {
              disconnectAndReject(new e.PublishToSessionError());
            }
          } else {
            resolve({ ...{ session }, ...{ publisher } });
          }
        });
      }).catch((error: e.ConnectivityError) => {
        disconnectAndReject(error);
      });
  });
}

/**
 * Attempt to subscribe to our publisher
 */
function checkSubscribeToSession(
  { session, publisher }: PublishToSessionResults,
  resources: Resources,
): Promise<SubscribeToSessionResults> {
  return new Promise((resolve, reject) => {
    const config = { testNetwork: true, audioVolume: 0 };
    const disconnectAndReject = (rejectError: Error) => {
      cleanupAll(resources).then(() => {
        reject(rejectError);
      });
    };
    if (resources.aborted) {
      disconnectAndReject(new e.ConnectivityTestAbortedError());
    } else if (!publisher.stream) {
      disconnectAndReject(new e.SubscribeToSessionError());
    } else {
      const subscriberDiv = document.createElement('div');
      resources.subscriberDiv = subscriberDiv;
      const subscriber = session.subscribe(publisher.stream, subscriberDiv, config, (error?: OT.OTError) => {
        if (error) {
          disconnectAndReject(new e.SubscribeToSessionError());
        } else {
          resolve({ ...{ session }, ...{ publisher }, ...{ subscriber } });
        }
      });
      resources.subscriber = subscriber;
    }
  });
}

/**
 * Attempt to connect to the Vonage client logging server
 */
function checkLoggingServer(OTInstance: typeof OT, options?: NetworkTestOptions): Promise<void>;
function checkLoggingServer(
  OTInstance: typeof OT,
  options: NetworkTestOptions | undefined,
  input: SubscribeToSessionResults):
Promise<SubscribeToSessionResults>;
function checkLoggingServer(OTInstance: typeof OT, options?: NetworkTestOptions, input?: SubscribeToSessionResults):
Promise<SubscribeToSessionResults | void> {
  return new Promise((resolve, reject) => {
    const loggingUrl =
      `${getOr('', 'properties.loggingURL', OTInstance)}/logging/ClientEvent`; // https://hlg.tokbox.com/prod
    const url = options && options.proxyServerUrl &&
      `${options.proxyServerUrl}/${loggingUrl.replace('https://', '')}` || loggingUrl;
    const handleError = () => reject(new e.LoggingServerConnectionError());

    axios.post(url)
      .then(response => response.status === 200 ? resolve(input) : handleError())
      .catch(handleError);

  });
}

/**
 * This method checks to see if the client can connect to Vonage Video API servers required for using Vonage Video API
 */
export function testConnectivity(
  OTInstance: typeof OT,
  credentials: SessionCredentials,
  otLogging: OTKLogger,
  options?: NetworkTestOptions,
): Promise<ConnectivityTestResults> {
  return new Promise((resolve, reject) => {
    const resources: Resources = { aborted: false, cleanup: Promise.resolve() };
    let settled = false;

    // Returns false if the test already ended, so the outcome is only reported once
    const settle = (): boolean => {
      if (settled) {
        return false;
      }
      settled = true;
      abortHooks.delete(abort);
      return true;
    };

    const abort = () => {
      if (settled || resources.aborted) {
        return;
      }
      resources.aborted = true;
      cleanupAll(resources).then(() => handleResults(new e.ConnectivityTestAbortedError()));
    };
    abortHooks.add(abort);

    const ensureNotAborted = <T>(value: T): Promise<T> => {
      if (!resources.aborted) {
        return Promise.resolve(value);
      }
      return cleanupAll(resources).then(() => {
        throw new e.ConnectivityTestAbortedError();
      });
    };

    const onSuccess = () => {
      const results: ConnectivityTestResults = {
        success: true,
        failedTests: [],
      };
      otLogging.logEvent({ action: 'testConnectivity', variation: 'Success' });
      return cleanupAll(resources).then(() => {
        if (settle()) {
          resolve(results);
        }
      });
    };

    const handleResults = (...errors: e.ConnectivityError[]) => {
      if (!settle()) {
        return;
      }
      /**
       * If we have a messaging server failure, we will also fail the media
       * server test by default.
       */
      const baseFailures: FailureCase[] = mapErrors(...errors);
      const messagingFailure = baseFailures.find(c => c.type === 'messaging');
      const failedTests = [
        ...baseFailures,
        ...messagingFailure ? mapErrors(new e.FailedMessagingServerTestError()) : [],
      ];

      const results = {
        failedTests,
        success: false,
      };
      otLogging.logEvent({
        action: 'testConnectivity',
        variation: 'Failure',
        payload: {
          failedTests: failedTests.map(test => ({
            type: test.type,
            error: test.error.name || 'Unknown Error',
          })),
          errorNames: errors.map(e => e.name || 'Unknown Error'),
        },
      });
      reject(results);
    };

    const onFailure = (error: Error) => {
      // An abort reports its own result once cleanup finishes
      if (resources.aborted) {
        return;
      }
      cleanupAll(resources).then(() => {
        /**
         * If we encounter an error before testing the connection to the logging server, let's perform
         * that test as well before returning results.
         */
        if (error.name === 'LoggingServerConnectionError') {
          handleResults(error);
        } else {
          checkLoggingServer(OTInstance, options)
            .then(() => handleResults(error))
            .catch((loggingError: e.LoggingServerConnectionError) => handleResults(error, loggingError));
        }
      });
    };

    connectToSession(OTInstance, credentials, resources, options)
      .then(ensureNotAborted)
      .then((session: OT.Session) => checkPublishToSession(OTInstance, session, resources, options))
      .then((results: PublishToSessionResults) => checkSubscribeToSession(results, resources))
      .then(ensureNotAborted)
      .then((results: SubscribeToSessionResults) => checkLoggingServer(OTInstance, options, results))
      .then(ensureNotAborted)
      .then(onSuccess)
      .catch(onFailure);
  });
}
