import OTKLogger from '@opentok/opentok-solutions-logging';
import NetworkTest from '../src';
import addSessionInfo from '../src/logging';
import { InvalidOnUpdateCallback } from '../src/errors';
import { SessionCredentials } from '../src/types/session';

const credentials: SessionCredentials = {
  applicationId: 'application-id',
  sessionId: 'session-id',
  token: 'token',
};

function createOpenTok(): typeof OT {
  return {
    initSession: jasmine.createSpy('initSession'),
  } as any;
}

describe('solutions logging integration', () => {
  it('adds the connected session metadata to the logger', () => {
    const logger = {
      addSessionInfo: jasmine.createSpy('addSessionInfo'),
    } as unknown as OTKLogger;
    const session = { connection: { connectionId: 'connection-id' } } as OT.Session;

    addSessionInfo(logger, session, credentials);

    expect(logger.addSessionInfo).toHaveBeenCalledWith({
      sessionId: credentials.sessionId,
      connectionId: 'connection-id',
      partnerId: credentials.applicationId,
    });
  });

  it('does not add session metadata before the SDK creates a connection', () => {
    const logger = {
      addSessionInfo: jasmine.createSpy('addSessionInfo'),
    } as unknown as OTKLogger;
    const session = { connection: undefined } as OT.Session;

    addSessionInfo(logger, session, credentials);

    expect(logger.addSessionInfo).not.toHaveBeenCalled();
  });

  it('excludes URL query data from the logger source', () => {
    const networkTest = new NetworkTest(createOpenTok(), credentials);
    const source = (networkTest.otLogging as any).analyticsData.source as string;

    expect(source).toBe(`${window.location.origin}${window.location.pathname}`);
    expect(source).not.toMatch(/[?#]/);
  });

  it('uses the logger default endpoint when the SDK does not expose one', () => {
    const networkTest = new NetworkTest(createOpenTok(), credentials);
    const open = spyOn(XMLHttpRequest.prototype, 'open').and.callThrough();
    spyOn(XMLHttpRequest.prototype, 'send').and.stub();

    networkTest.otLogging.logEvent({ action: 'test' });

    expect(open).toHaveBeenCalledWith(
      'POST',
      'https://hlg.tokbox.com/prod/logging/ClientEvent',
      true,
    );
  });

  it('logs the attempt and invalid callback failure events', () => {
    const networkTest = new NetworkTest(createOpenTok(), credentials);
    const logEvent = spyOn(networkTest.otLogging, 'logEvent').and.stub();

    expect(() => networkTest.testQuality('invalid' as any)).toThrow(new InvalidOnUpdateCallback());

    expect(logEvent.calls.argsFor(0)[0]).toEqual({
      action: 'testQuality',
      variation: 'Attempt',
    });
    expect(logEvent.calls.argsFor(1)[0]).toEqual({
      action: 'testQuality',
      variation: 'Failure',
      payload: {
        errorName: 'InvalidOnUpdateCallback',
        reason: 'updateCallback is not a function',
      },
    });
  });
});
