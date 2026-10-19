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
import addSessionInfo from '../logging';
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

const CLEANUP_TIMEOUT_MS = 5000;
const abortHooks = new Set<() => void>();
const releasedMedia = new WeakSet<object>();

// session.disconnect() resolves right away when the session is not connected
async function disconnectFromSession(session?: OT.Session): Promise<void> {
  if (!session) {
    return;
  }
  try {
    await session.disconnect();
    session.off();
  } catch {
    // Cleanup is best effort
  }
}

// session.unsubscribe() has no promise variant, so wait for the destroyed event
function cleanSubscriber(session?: OT.Session, subscriber?: OT.Subscriber): Promise<void> {
  if (!session || !subscriber || releasedMedia.has(subscriber)) {
    return Promise.resolve();
  }
  releasedMedia.add(subscriber);
  return new Promise((resolve) => {
    subscriber.on('destroyed', () => resolve());
    try {
      session.unsubscribe(subscriber);
    } catch {
      resolve();
    }
  });
}

// destroy.promise() also resolves right away for a publisher the SDK already destroyed
async function cleanPublisher(publisher?: OT.Publisher): Promise<void> {
  if (!publisher || releasedMedia.has(publisher)) {
    return;
  }
  releasedMedia.add(publisher);
  try {
    await publisher.destroy.promise();
  } catch {
    // Cleanup is best effort
  }
}

async function releaseMedia(resources: Resources): Promise<void> {
  await cleanSubscriber(resources.session, resources.subscriber);
  await cleanPublisher(resources.publisher);
  await disconnectFromSession(resources.session);
}

// Resolve with true if the work did not finish in time
function timesOut(work: Promise<void>, ms: number): Promise<boolean> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timeoutId = setTimeout(() => resolve(true), ms);
  });
  return Promise.race([work.then(() => false), timeout]).then((timedOut) => {
    clearTimeout(timeoutId);
    return timedOut;
  });
}

function removeElement(element?: HTMLElement) {
  element?.parentNode?.removeChild(element);
}

/**
 * Release the subscriber, publisher, session and page elements. Safe to call more than once.
 */
function cleanupAll(resources: Resources): Promise<void> {
  // Chain on any cleanup already in progress so callers wait for the same work
  resources.cleanup = resources.cleanup
    .then(() => timesOut(releaseMedia(resources), CLEANUP_TIMEOUT_MS))
    .then((timedOut) => {
      if (timedOut) {
        // A stuck SDK call must not keep the camera or session open
        cleanPublisher(resources.publisher);
        disconnectFromSession(resources.session);
      }
      removeElement(resources.publisherDiv);
      removeElement(resources.subscriberDiv);
    })
    .catch(() => undefined);
  return resources.cleanup;
}

function throwIfAborted(resources: Resources) {
  if (resources.aborted) {
    throw new e.ConnectivityTestAbortedError();
  }
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
async function connectToSession(
  OTInstance: typeof OT,
  { applicationId, sessionId, token }: SessionCredentials,
  resources: Resources,
  options?: NetworkTestOptions,
): Promise<OT.Session> {
  const sessionOptions: InitSessionOptions = options?.initSessionOptions ?? {};
  if (options?.proxyServerUrl) {
    // eslint-disable-next-line no-prototype-builtins
    if (!OTInstance.hasOwnProperty('setProxyUrl')) { // Fallback for OT.version < 2.17.4
      sessionOptions.proxyUrl = options.proxyServerUrl;
    }
  }
  const session = OTInstance.initSession(applicationId, sessionId, sessionOptions);
  resources.session = session;
  try {
    await session.connect.promise(token);
    return session;
  } catch (error) {
    const otError = error as OT.OTError;
    if (errorHasName(otError, OTErrorType.OT_AUTHENTICATION_ERROR)) {
      throw new e.ConnectToSessionTokenError();
    }
    if (errorHasName(otError, OTErrorType.OT_INVALID_SESSION_ID)) {
      throw new e.ConnectToSessionSessionIdError();
    }
    if (errorHasName(otError, OTErrorType.OT_CONNECT_FAILED)) {
      throw new e.ConnectToSessionNetworkError();
    }
    if (errorHasName(otError, OTErrorType.OT_INVALID_HTTP_STATUS)) {
      throw new e.APIConnectivityError();
    }
    throw new e.ConnectToSessionError();
  }
}

/**
 * Ensure that audio and video devices are available
 */
function validateDevices(OTInstance: typeof OT): Promise<AvailableDevices> {
  return new Promise((resolve, reject) => {
    OTInstance.getDevices((error?: OT.OTError, devices: OT.Device[] = []) => {
      if (error) {
        reject(new e.FailedToObtainMediaDevices());
        return;
      }

      const availableDevices: AvailableDevices = devices.reduce(
        (acc: AvailableDevices, device: OT.Device) => {
          const type: AV = device.kind === 'audioInput' ? 'audio' : 'video';
          return { ...acc, [type]: { ...acc[type], [device.deviceId]: device } };
        },
        { audio: {}, video: {} },
      );

      if (!Object.keys(availableDevices.audio).length && !Object.keys(availableDevices.video).length) {
        reject(new e.FailedToObtainMediaDevices());
        return;
      }
      resolve(availableDevices);
    });
  });
}

/**
 * Create a local publisher object using any specified device options
 */
async function checkCreateLocalPublisher(
  OTInstance: typeof OT,
  resources: Resources,
  options?: NetworkTestOptions,
): Promise<OT.Publisher> {
  const availableDevices = await validateDevices(OTInstance);
  throwIfAborted(resources);
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
  return new Promise((resolve, reject) => {
    const publisher = OTInstance.initPublisher(publisherDiv, publisherOptions, (error?: OT.OTError) => {
      if (error) {
        if (error.name === 'OT_USER_MEDIA_ACCESS_DENIED' ||
            (error.message && (error.message.toLowerCase().includes('permission') ||
            error.message.toLowerCase().includes('access denied') ||
            error.message.toLowerCase().includes('not allowed')))) {
          reject(new PermissionDeniedError());
        } else {
          reject(new e.FailedToCreateLocalPublisher());
        }
        return;
      }
      resolve(publisher);
    });
    // Track the publisher right away so it is released even if initialization never finishes
    resources.publisher = publisher;
    publisher.on('streamCreated', () => {
      publisherDiv.style.visibility = 'hidden';
    });
  });
}

/**
 * Attempt to publish to the session
 */
async function checkPublishToSession(
  OTInstance: typeof OT, session: OT.Session,
  resources: Resources,
  options?: NetworkTestOptions,
): Promise<OT.Publisher> {
  const publisher = await checkCreateLocalPublisher(OTInstance, resources, options);
  throwIfAborted(resources);
  try {
    await session.publish.promise(publisher);
    return publisher;
  } catch (error) {
    const otError = error as OT.OTError;
    if (errorHasName(otError, OTErrorType.NOT_CONNECTED)) {
      throw new e.PublishToSessionNotConnectedError();
    }
    if (errorHasName(otError, OTErrorType.UNABLE_TO_PUBLISH)) {
      throw new e.PublishToSessionPermissionOrTimeoutError();
    }
    throw new e.PublishToSessionError();
  }
}

/**
 * Attempt to subscribe to our publisher
 */
async function checkSubscribeToSession(
  session: OT.Session,
  publisher: OT.Publisher,
  resources: Resources,
): Promise<void> {
  const config = { testNetwork: true, audioVolume: 0 };
  if (!publisher.stream) {
    throw new e.SubscribeToSessionError();
  }

  const subscriberDiv = document.createElement('div');
  resources.subscriberDiv = subscriberDiv;
  try {
    resources.subscriber = await session.subscribe.promise(publisher.stream, subscriberDiv, config);
  } catch (error) {
    throw new e.SubscribeToSessionError();
  }
}

/**
 * Attempt to connect to the Vonage client logging server
 */
function checkLoggingServer(OTInstance: typeof OT, options?: NetworkTestOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const loggingUrl =
      `${getOr('', 'properties.loggingURL', OTInstance)}/logging/ClientEvent`; // https://hlg.tokbox.com/prod
    const url = options && options.proxyServerUrl &&
      `${options.proxyServerUrl}/${loggingUrl.replace('https://', '')}` || loggingUrl;
    const handleError = () => reject(new e.LoggingServerConnectionError());

    axios.post(url)
      .then(response => response.status === 200 ? resolve() : handleError())
      .catch(handleError);

  });
}

async function runConnectivityChecks(
  OTInstance: typeof OT,
  credentials: SessionCredentials,
  resources: Resources,
  options: NetworkTestOptions | undefined,
  otLogging: OTKLogger,
): Promise<void> {
  const session = await connectToSession(OTInstance, credentials, resources, options);
  addSessionInfo(otLogging, session, credentials);
  throwIfAborted(resources);
  const publisher = await checkPublishToSession(OTInstance, session, resources, options);
  throwIfAborted(resources);
  await checkSubscribeToSession(session, publisher, resources);
  throwIfAborted(resources);
  await checkLoggingServer(OTInstance, options);
  throwIfAborted(resources);
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

    const abort = () => {
      if (settled || resources.aborted) {
        return;
      }
      resources.aborted = true;
      cleanupAll(resources).then(() => handleResults(new e.ConnectivityTestAbortedError()));
    };
    abortHooks.add(abort);

    const onSuccess = async () => {
      await cleanupAll(resources);
      if (!settle()) {
        return;
      }
      const results: ConnectivityTestResults = {
        success: true,
        failedTests: [],
      };
      otLogging.logEvent({ action: 'testConnectivity', variation: 'Success' });
      resolve(results);
    };

    const onFailure = async (error: Error) => {
      await cleanupAll(resources);
      // An abort reports its own result
      if (settled || resources.aborted) {
        return;
      }
      /**
       * If we encounter an error before testing the connection to the logging server, let's perform
       * that test as well before returning results.
       */
      if (error.name === 'LoggingServerConnectionError') {
        handleResults(error);
        return;
      }
      try {
        await checkLoggingServer(OTInstance, options);
        handleResults(error);
      } catch (loggingError) {
        handleResults(error, loggingError as e.LoggingServerConnectionError);
      }
    };

    runConnectivityChecks(OTInstance, credentials, resources, options, otLogging)
      .then(onSuccess, onFailure);
  });
}
