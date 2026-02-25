"use strict";
/**
 * @module NetworkTest
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorNames = void 0;
/**
* Define Network Connectivy class
*/
// eslint-disable-next-line
const version = require('../package.json').version;
const testConnectivity_1 = require("./testConnectivity");
const testQuality_1 = require("./testQuality");
const errors_1 = require("./errors");
const opentok_solutions_logging_1 = require("opentok-solutions-logging");
class NetworkTest {
    /**
     * Returns an instance of NetworkConnectivity. See the "API reference" section of the
     * README.md file in the root of the @vonage/video-client-network-test project for details.
     */
    constructor(OTInstance, credentials, options) {
        this.validateOT(OTInstance);
        this.validateCredentials(credentials);
        const proxyServerUrl = this.validateProxyUrl(options);
        this.otLogging = this.startLoggingEngine(credentials.applicationId, credentials.sessionId, proxyServerUrl);
        this.OTInstance = OTInstance;
        this.credentials = credentials;
        this.options = options;
        this.setProxyUrl(proxyServerUrl);
    }
    validateOT(OTInstance) {
        if (!OTInstance || typeof OTInstance !== 'object' || !OTInstance.initSession) {
            throw new errors_1.MissingOpenTokInstanceError();
        }
    }
    validateCredentials(credentials) {
        if (!credentials) {
            throw new errors_1.MissingSessionCredentialsError();
        }
        if (!credentials.applicationId || !credentials.sessionId || !credentials.token) {
            throw new errors_1.IncompleteSessionCredentialsError();
        }
    }
    validateProxyUrl(options) {
        if (!options || !options.proxyServerUrl) {
            return '';
        }
        return options.proxyServerUrl;
    }
    setProxyUrl(proxyServerUrl) {
        if (this.OTInstance.setProxyUrl && typeof this.OTInstance.setProxyUrl === 'function' && proxyServerUrl) {
            this.OTInstance.setProxyUrl(proxyServerUrl);
        }
    }
    startLoggingEngine(applicationId, sessionId, proxyUrl) {
        return new opentok_solutions_logging_1.default({
            sessionId,
            partnerId: applicationId,
            source: window.location.href,
            clientVersion: `js-network-test-${version}`,
            name: 'opentok-network-test',
            componentId: 'opentok-network-test',
        }, {
            proxyUrl,
        });
    }
    /**
     * This method checks to see if the client can connect to Vonage Video API servers required for
     * using Vonage Video API.
     *
     * See the "API reference" section of the README.md file in the root of the
     * @vonage/video-client-network-test project for details.
     */
    testConnectivity() {
        this.otLogging.logEvent({ action: 'testConnectivity', variation: 'Attempt' });
        return (0, testConnectivity_1.testConnectivity)(this.OTInstance, this.credentials, this.otLogging, this.options);
    }
    /**
     * This function runs a test publisher and based on the measured video bitrate,
     * audio bitrate, and the audio packet loss for the published stream, it returns
     * results indicating the recommended supported publisher settings.
     *
     * See the "API reference" section of the README.md file in the root of the
     * @vonage/video-client-network-test project for details.
     */
    testQuality(updateCallback) {
        this.otLogging.logEvent({ action: 'testQuality', variation: 'Attempt' });
        if (updateCallback) {
            if (typeof updateCallback !== 'function' || updateCallback.length !== 1) {
                this.otLogging.logEvent({
                    action: 'testQuality',
                    variation: 'Failure',
                    payload: {
                        errorName: 'InvalidOnUpdateCallback',
                        reason: typeof updateCallback !== 'function'
                            ? 'updateCallback is not a function'
                            : 'updateCallback does not accept exactly 1 parameter',
                    },
                });
                throw new errors_1.InvalidOnUpdateCallback();
            }
        }
        return (0, testQuality_1.testQuality)(this.OTInstance, this.credentials, this.otLogging, this.options, updateCallback);
    }
    /**
     * Stops the currently running test.
     *
     * See the "API reference" section of the README.md file in the root of the
     * @vonage/video-client-network-test project for details.
     */
    stop() {
        (0, testQuality_1.stopQualityTest)();
    }
}
exports.default = NetworkTest;
var types_1 = require("./errors/types");
Object.defineProperty(exports, "ErrorNames", { enumerable: true, get: function () { return types_1.ErrorNames; } });
//# sourceMappingURL=index.js.map