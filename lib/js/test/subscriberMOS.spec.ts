import subscriberMOS from '../src/testQuality/helpers/subscriberMOS';
import MOSState from '../src/testQuality/helpers/MOSState';

function createSubscriberStat(
  timestamp: number,
  audioOpts: { bytesReceived?: number; packetsLost?: number; packetsReceived?: number } = {},
  videoOpts: { bytesReceived?: number; packetsLost?: number; packetsReceived?: number } = {},
): OT.SubscriberStats {
  return {
    audio: {
      bytesReceived: audioOpts.bytesReceived ?? 1000,
      packetsLost: audioOpts.packetsLost ?? 0,
      packetsReceived: audioOpts.packetsReceived ?? 100,
    },
    video: {
      bytesReceived: videoOpts.bytesReceived ?? 5000,
      packetsLost: videoOpts.packetsLost ?? 0,
      packetsReceived: videoOpts.packetsReceived ?? 100,
      frameRate: 30,
    },
    timestamp,
  } as OT.SubscriberStats;
}

function createMockStatsMap(timestamp: number): Map<string, any> {
  return new Map<string, any>([
    ['video1', {
      id: 'video1',
      type: 'outbound-rtp',
      kind: 'video',
      ssrc: 1,
      bytesSent: 1000 + timestamp,
      timestamp,
      qualityLimitationReason: 'none',
      frameWidth: 640,
      frameHeight: 480,
      framesPerSecond: 30,
      active: true,
      pliCount: 0,
      nackCount: 0,
    }],
    ['audio1', {
      id: 'audio1',
      type: 'outbound-rtp',
      kind: 'audio',
      ssrc: 2,
      bytesSent: 500 + timestamp,
      timestamp,
    }],
  ]);
}

function flushPromises(): Promise<void> {
  return new Promise<void>(resolve => window.setTimeout(resolve, 0));
}

describe('subscriberMOS', () => {
  let mosState: MOSState;
  let mockSubscriber: any;
  let mockPublisher: any;
  let mockCallback: jasmine.Spy;
  let mockListener: jasmine.Spy;
  let capturedIntervalCallback: (() => void) | undefined;
  let setIntervalSpy: jasmine.Spy;

  beforeEach(() => {
    mosState = new MOSState();
    mockCallback = jasmine.createSpy('callback');
    mockListener = jasmine.createSpy('listener');

    mockSubscriber = {
      getStats: jasmine.createSpy('getStats'),
      on: jasmine.createSpy('on'),
      stream: null,
    };

    mockPublisher = {
      on: jasmine.createSpy('on'),
    };

    capturedIntervalCallback = undefined;
    setIntervalSpy = spyOn(window, 'setInterval').and.callFake((cb: any) => {
      capturedIntervalCallback = cb;
      return 99 as any;
    });
  });

  afterEach(() => {
    setIntervalSpy.and.callThrough();
    if (mosState.intervalId) {
      mosState.clearInterval();
    }
  });

  it('returns mosState with polling interval started', () => {
    const result = subscriberMOS(mosState, mockSubscriber, mockPublisher, mockListener, mockCallback);

    expect(result).toBe(mosState);
    expect(mosState.intervalId).toBe(99);
  });

  it('clears interval and calls callback when audio bytesReceived is negative', () => {
    const faultyStats = createSubscriberStat(1000, { bytesReceived: -1 });
    mockSubscriber.getStats.and.callFake((cb: any) => cb(undefined, faultyStats));

    subscriberMOS(mosState, mockSubscriber, mockPublisher, mockListener, mockCallback);
    capturedIntervalCallback!();

    expect(mosState.intervalId).toBeUndefined();
    expect(mockCallback).toHaveBeenCalledWith(mosState);
  });

  it('clears interval and calls callback when video bytesReceived is negative', () => {
    const faultyStats = createSubscriberStat(1000, {}, { bytesReceived: -1 });
    mockSubscriber.getStats.and.callFake((cb: any) => cb(undefined, faultyStats));

    subscriberMOS(mosState, mockSubscriber, mockPublisher, mockListener, mockCallback);
    capturedIntervalCallback!();

    expect(mosState.intervalId).toBeUndefined();
    expect(mockCallback).toHaveBeenCalledWith(mosState);
  });

  it('does not abort when audio track is absent', () => {
    const statsWithNullAudio: any = {
      audio: null,
      video: { bytesReceived: 5000, packetsLost: 0, packetsReceived: 100, frameRate: 30 },
      timestamp: 1000,
    };
    mockSubscriber.getStats.and.callFake((cb: any) => cb(undefined, statsWithNullAudio));

    subscriberMOS(mosState, mockSubscriber, mockPublisher, mockListener, mockCallback);
    capturedIntervalCallback!();

    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('logs subscriber stat even when listener argument is absent', async () => {
    let callCount = 0;
    const statsList = [
      createSubscriberStat(1000),
      createSubscriberStat(2000),
    ];
    mockSubscriber.getStats.and.callFake((cb: any) => cb(undefined, statsList[callCount++]));

    subscriberMOS(mosState, mockSubscriber, mockPublisher, null, mockCallback);
    capturedIntervalCallback!();
    await flushPromises();

    expect(mosState.subscriberStatsLog.length).toBe(1);
  });

  it('calls getStatsListener with stats when provided as a function', async () => {
    const stats = createSubscriberStat(1000);
    mockSubscriber.getStats.and.callFake((cb: any) => cb(undefined, stats));

    subscriberMOS(mosState, mockSubscriber, mockPublisher, mockListener, mockCallback);
    capturedIntervalCallback!();
    await flushPromises();

    expect(mockListener).toHaveBeenCalledWith(undefined, stats, undefined);
  });

  it('clears interval when subscriber is destroyed', () => {
    subscriberMOS(mosState, mockSubscriber, mockPublisher, mockListener, mockCallback);

    const destroyedHandler = mockSubscriber.on.calls.argsFor(0)[1];
    destroyedHandler();

    expect(mosState.intervalId).toBeUndefined();
  });

  it('clears interval when publisher is destroyed', () => {
    subscriberMOS(mosState, mockSubscriber, mockPublisher, mockListener, mockCallback);

    const destroyedHandler = mockPublisher.on.calls.argsFor(0)[1];
    destroyedHandler();

    expect(mosState.intervalId).toBeUndefined();
  });

  describe('subscriberStats guard', () => {
    it('returns null without side effects when subscriberStats is undefined', () => {
      mockSubscriber.getStats.and.callFake((cb: any) => cb(undefined, undefined));

      subscriberMOS(mosState, mockSubscriber, mockPublisher, mockListener, mockCallback);
      capturedIntervalCallback!();

      expect(mockCallback).not.toHaveBeenCalled();
      expect(mosState.subscriberStatsLog.length).toBe(0);
      expect(mosState.intervalId).toBe(99);
    });

    it('returns null without side effects when subscriberStats is null', () => {
      mockSubscriber.getStats.and.callFake((cb: any) => cb(undefined, null));

      subscriberMOS(mosState, mockSubscriber, mockPublisher, mockListener, mockCallback);
      capturedIntervalCallback!();

      expect(mockCallback).not.toHaveBeenCalled();
      expect(mosState.subscriberStatsLog.length).toBe(0);
      expect(mosState.intervalId).toBe(99);
    });
  });

  describe('scoring logic', () => {
    let statsCallCount: number;

    function setupPublisherMock() {
      statsCallCount = 0;
      mockPublisher.getRtcStatsReport = jasmine.createSpy('getRtcStatsReport').and.callFake(() => {
        const timestamp = 1000 + (++statsCallCount) * 1000;
        return Promise.resolve([{ rtcStatsReport: createMockStatsMap(timestamp) }]);
      });
      mockSubscriber.stream = { videoDimensions: { width: 640, height: 480 } };
    }

    it('calculates audio score of 1 when totalAudioPackets is zero between samples', async () => {
      setupPublisherMock();

      let getStatsCallCount = 0;
      const statsList = [
        createSubscriberStat(1000, { packetsLost: 5, packetsReceived: 10 }),
        createSubscriberStat(2000, { packetsLost: 5, packetsReceived: 10 }),
      ];
      mockSubscriber.getStats.and.callFake((cb: any) => cb(undefined, statsList[getStatsCallCount++]));

      subscriberMOS(mosState, mockSubscriber, mockPublisher, null, mockCallback);

      capturedIntervalCallback!();
      await flushPromises();

      capturedIntervalCallback!();
      await flushPromises();

      expect(mosState.publisherStatsLog.length).toBe(2);
      expect(mosState.audioScoresLog.length).toBe(1);
      expect(mosState.audioScoresLog[0]).toBe(1);
    });

    it('clamps packetLossRatio to 0 when it is negative between samples', async () => {
      setupPublisherMock();

      let getStatsCallCount = 0;
      const statsList = [
        createSubscriberStat(1000, { packetsLost: 10, packetsReceived: 90 }, { bytesReceived: 1000 }),
        createSubscriberStat(2000, { packetsLost: 8, packetsReceived: 102 }, { bytesReceived: 5000 }),
      ];
      mockSubscriber.getStats.and.callFake((cb: any) => cb(undefined, statsList[getStatsCallCount++]));

      subscriberMOS(mosState, mockSubscriber, mockPublisher, null, mockCallback);

      capturedIntervalCallback!();
      await flushPromises();

      capturedIntervalCallback!();
      await flushPromises();

      expect(mosState.publisherStatsLog.length).toBe(2);
      expect(mosState.audioScoresLog.length).toBe(1);
      expect(mosState.audioScoresLog[0]).toBeGreaterThan(1);
    });
  });
});
