/**
 * @module NetworkTest
 */
import { SessionCredentials, InitSessionOptions } from './types/session';
import { UpdateCallback, UpdateCallbackStats } from './types/callbacks';
import { ConnectivityTestResults } from './testConnectivity';
import { QualityTestResults } from './testQuality';
import OTKAnalytics from 'opentok-solutions-logging';
export interface NetworkTestOptions {
    audioOnly?: boolean;
    timeout?: number;
    audioSource?: string;
    videoSource?: string;
    initSessionOptions?: InitSessionOptions;
    proxyServerUrl?: string;
    scalableVideo?: boolean;
    fullHd?: boolean;
}
export { QualityTestResults } from './testQuality';
export { ConnectivityTestResults } from './testConnectivity';
export default class NetworkTest {
    credentials: SessionCredentials;
    OTInstance: typeof OT;
    otLogging: OTKAnalytics;
    options?: NetworkTestOptions;
    /**
     * Returns an instance of NetworkConnectivity. See the "API reference" section of the
     * README.md file in the root of the @vonage/video-client-network-test project for details.
     */
    constructor(OTInstance: typeof OT, credentials: SessionCredentials, options?: NetworkTestOptions);
    private validateOT;
    private validateCredentials;
    private validateProxyUrl;
    private setProxyUrl;
    private startLoggingEngine;
    /**
     * This method checks to see if the client can connect to Vonage Video API servers required for
     * using Vonage Video API.
     *
     * See the "API reference" section of the README.md file in the root of the
     * @vonage/video-client-network-test project for details.
     */
    testConnectivity(): Promise<ConnectivityTestResults>;
    /**
     * This function runs a test publisher and based on the measured video bitrate,
     * audio bitrate, and the audio packet loss for the published stream, it returns
     * results indicating the recommended supported publisher settings.
     *
     * See the "API reference" section of the README.md file in the root of the
     * @vonage/video-client-network-test project for details.
     */
    testQuality(updateCallback?: UpdateCallback<UpdateCallbackStats>): Promise<QualityTestResults>;
    /**
     * Stops the currently running test.
     *
     * See the "API reference" section of the README.md file in the root of the
     * @vonage/video-client-network-test project for details.
     */
    stop(): void;
}
export { ErrorNames } from './errors/types';
//# sourceMappingURL=index.d.ts.map