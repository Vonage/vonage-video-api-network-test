declare module '@opentok/opentok-solutions-logging' {
  interface ConstructorConfig {
    sessionId?: string;
    partnerId?: string;
    clientVersion: string;
    source: string;
    componentId: string;
    name: string;
  }

  interface ConstructorOptions {
    server?: boolean;
    proxyUrl?: string;
    loggingUrl?: string;
  }

  interface SessionInfo {
    sessionId: string;
    connectionId: string;
    partnerId: string;
  }

  class OTKAnalytics {
    constructor(config: ConstructorConfig, options?: ConstructorOptions);
    addSessionInfo(info: SessionInfo): void;
    logEvent(data: { [key: string]: any }): void;
  }

  export default OTKAnalytics;
}
