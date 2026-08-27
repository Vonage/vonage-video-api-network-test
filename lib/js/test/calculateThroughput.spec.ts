import calculateThroughput from '../src/testQuality/helpers/calculateThroughput';
import MOSState from '../src/testQuality/helpers/MOSState';
import { PublisherStats } from '../src/types/publisher';

function createPublisherStat(
  timestamp: number = 1000,
  overrides: Partial<PublisherStats> = {},
): PublisherStats {
  return {
    videoStats: [{
      ssrc: 1,
      byteSent: 1000,
      kbs: 500,
      qualityLimitationReason: 'none',
      resolution: '640x480',
      framerate: 30,
      active: true,
      pliCount: 0,
      nackCount: 0,
      currentTimestamp: timestamp,
    }],
    audioStats: [{ kbs: 100, byteSent: 500, currentTimestamp: timestamp }],
    availableOutgoingBitrate: 1000000,
    videoByteSent: 1000,
    videoKbsSent: 500,
    simulcastEnabled: false,
    transportProtocol: 'udp',
    currentRoundTripTime: 0.05,
    timestamp,
    ...overrides,
  };
}

function createSubscriberStat(
  timestamp: number = 1000,
  opts: { noAudio?: boolean; noVideo?: boolean } = {},
): OT.SubscriberStats {
  const stat: any = { timestamp };
  if (!opts.noAudio) {
    stat.audio = { bytesReceived: 1000, packetsLost: 0, packetsReceived: 100 };
  }
  if (!opts.noVideo) {
    stat.video = { bytesReceived: 5000, packetsLost: 0, packetsReceived: 100, frameRate: 30 };
  }
  return stat as OT.SubscriberStats;
}

describe('calculateThroughput', () => {
  let state: MOSState;

  beforeEach(() => {
    state = new MOSState();
  });

  it('returns audio unsupported with noMic reason when no audio track', () => {
    state.subscriberStatsLog.push(
      createSubscriberStat(1000, { noAudio: true }),
      createSubscriberStat(2000, { noAudio: true }),
    );
    state.publisherStatsLog.push(createPublisherStat(1000));

    const result = calculateThroughput(state);

    expect(result.audio.supported).toBe(false);
    expect(result.audio.reason).toBe('No microphone was found.');
  });

  it('returns video unsupported with bandwidthLow reason when audioOnlyFallback is set', () => {
    const fallbackState = new MOSState(true);
    fallbackState.subscriberStatsLog.push(
      createSubscriberStat(1000),
      createSubscriberStat(2000),
    );
    fallbackState.publisherStatsLog.push(createPublisherStat(1000));

    const result = calculateThroughput(fallbackState);

    expect(result.video.supported).toBe(false);
    expect(result.video.reason).toBe('Bandwidth too low.');
  });

  it('returns video unsupported with noCam reason when no video track', () => {
    state.subscriberStatsLog.push(
      createSubscriberStat(1000, { noVideo: true }),
      createSubscriberStat(2000, { noVideo: true }),
    );
    state.publisherStatsLog.push(createPublisherStat(1000));

    const result = calculateThroughput(state);

    expect(result.video.supported).toBe(false);
    expect(result.video.reason).toBe('No camera was found.');
  });

  it('uses 0 for audio bitrate when publisher has no audio stats', () => {
    const pubStatNoAudio = createPublisherStat(1000, { audioStats: [] });
    state.subscriberStatsLog.push(
      createSubscriberStat(1000),
      createSubscriberStat(2000),
    );
    state.publisherStatsLog.push(pubStatNoAudio);

    const result = calculateThroughput(state);

    expect(result.audio.bitrate).toBe(0);
  });

  it('returns valid stats for the normal case with audio and video', () => {
    state.subscriberStatsLog.push(
      createSubscriberStat(1000),
      createSubscriberStat(2000),
    );
    state.publisherStatsLog.push(createPublisherStat(1000));

    const result = calculateThroughput(state);

    expect(result.audio.bitrate).toBeDefined();
    expect(result.audio.packetLossRatio).toBeDefined();
    expect(result.video).toBeDefined();
    expect(result.video.frameRate).toBeDefined();
    expect(result.video.recommendedFrameRate).toBeDefined();
    expect(result.video.recommendedResolution).toBeDefined();
  });

  describe('majority-vote qualityLimitationReason', () => {
    function createPubStatWithReason(
      timestamp: number,
      reason: string | undefined,
    ): PublisherStats {
      return createPublisherStat(timestamp, {
        videoStats: [{
          ssrc: 1,
          byteSent: 1000,
          kbs: 500,
          qualityLimitationReason: reason,
          resolution: '640x480',
          framerate: 30,
          active: true,
          pliCount: 0,
          nackCount: 0,
          currentTimestamp: timestamp,
        }],
      });
    }

    it('returns undefined when all limitations are "none"', () => {
      state.subscriberStatsLog.push(
        createSubscriberStat(1000),
        createSubscriberStat(2000),
      );
      state.publisherStatsLog.push(
        createPubStatWithReason(1000, 'none'),
        createPubStatWithReason(2000, 'none'),
        createPubStatWithReason(3000, 'none'),
      );

      const result = calculateThroughput(state);

      expect(result.video.qualityLimitationReason).toBeUndefined();
    });

    it('returns undefined when all limitations are undefined/null', () => {
      state.subscriberStatsLog.push(
        createSubscriberStat(1000),
        createSubscriberStat(2000),
      );
      state.publisherStatsLog.push(
        createPubStatWithReason(1000, undefined),
        createPubStatWithReason(2000, undefined),
      );

      const result = calculateThroughput(state);

      expect(result.video.qualityLimitationReason).toBeUndefined();
    });

    it('suppresses a transient limitation that does not exceed majority threshold', () => {
      state.subscriberStatsLog.push(
        createSubscriberStat(1000),
        createSubscriberStat(2000),
      );
      // 1 out of 10 samples reports "bandwidth" — should be suppressed
      const samples = Array.from({ length: 10 }, (_, i) =>
        createPubStatWithReason((i + 1) * 1000, i === 5 ? 'bandwidth' : 'none')
      );
      state.publisherStatsLog.push(...samples);

      const result = calculateThroughput(state);

      expect(result.video.qualityLimitationReason).toBeUndefined();
    });

    it('reports a sustained limitation that exceeds majority (>50%) threshold', () => {
      state.subscriberStatsLog.push(
        createSubscriberStat(1000),
        createSubscriberStat(2000),
      );
      // All 10 samples within a 5s window; 6 report "bandwidth" — majority
      const baseTs = 5000;
      const samples = Array.from({ length: 10 }, (_, i) =>
        createPubStatWithReason(baseTs + i * 400, i < 6 ? 'bandwidth' : 'none')
      );
      state.publisherStatsLog.push(...samples);

      const result = calculateThroughput(state);

      expect(result.video.qualityLimitationReason).toBe('bandwidth');
    });

    it('reports "cpu" when it exceeds majority threshold', () => {
      state.subscriberStatsLog.push(
        createSubscriberStat(1000),
        createSubscriberStat(2000),
      );
      // 4 out of 6 samples report "cpu"
      state.publisherStatsLog.push(
        createPubStatWithReason(1000, 'cpu'),
        createPubStatWithReason(2000, 'cpu'),
        createPubStatWithReason(3000, 'none'),
        createPubStatWithReason(4000, 'cpu'),
        createPubStatWithReason(5000, 'none'),
        createPubStatWithReason(6000, 'cpu'),
      );

      const result = calculateThroughput(state);

      expect(result.video.qualityLimitationReason).toBe('cpu');
    });

    it('does not report a reason at exactly 50% (requires strictly more than half)', () => {
      state.subscriberStatsLog.push(
        createSubscriberStat(1000),
        createSubscriberStat(2000),
      );
      // Exactly 5 out of 10 — at threshold, not above
      const samples = Array.from({ length: 10 }, (_, i) =>
        createPubStatWithReason((i + 1) * 1000, i < 5 ? 'bandwidth' : 'none')
      );
      state.publisherStatsLog.push(...samples);

      const result = calculateThroughput(state);

      expect(result.video.qualityLimitationReason).toBeUndefined();
    });

    it('picks the reason with the highest count when multiple reasons are present', () => {
      state.subscriberStatsLog.push(
        createSubscriberStat(1000),
        createSubscriberStat(2000),
      );
      // 7 "bandwidth", 2 "cpu", 1 "none" — bandwidth is majority
      state.publisherStatsLog.push(
        createPubStatWithReason(1000, 'bandwidth'),
        createPubStatWithReason(2000, 'bandwidth'),
        createPubStatWithReason(3000, 'cpu'),
        createPubStatWithReason(4000, 'bandwidth'),
        createPubStatWithReason(5000, 'bandwidth'),
        createPubStatWithReason(6000, 'cpu'),
        createPubStatWithReason(7000, 'bandwidth'),
        createPubStatWithReason(8000, 'bandwidth'),
        createPubStatWithReason(9000, 'bandwidth'),
        createPubStatWithReason(10000, 'none'),
      );

      const result = calculateThroughput(state);

      expect(result.video.qualityLimitationReason).toBe('bandwidth');
    });

    it('returns undefined when multiple reasons are present but none exceeds majority', () => {
      state.subscriberStatsLog.push(
        createSubscriberStat(1000),
        createSubscriberStat(2000),
      );
      // 4 "bandwidth", 4 "cpu", 2 "none" — neither exceeds 50%
      state.publisherStatsLog.push(
        createPubStatWithReason(1000, 'bandwidth'),
        createPubStatWithReason(2000, 'bandwidth'),
        createPubStatWithReason(3000, 'cpu'),
        createPubStatWithReason(4000, 'cpu'),
        createPubStatWithReason(5000, 'bandwidth'),
        createPubStatWithReason(6000, 'cpu'),
        createPubStatWithReason(7000, 'bandwidth'),
        createPubStatWithReason(8000, 'cpu'),
        createPubStatWithReason(9000, 'none'),
        createPubStatWithReason(10000, 'none'),
      );

      const result = calculateThroughput(state);

      expect(result.video.qualityLimitationReason).toBeUndefined();
    });

    it('reports reason when a single sample is the only sample (1 out of 1 = 100%)', () => {
      state.subscriberStatsLog.push(
        createSubscriberStat(1000),
        createSubscriberStat(2000),
      );
      state.publisherStatsLog.push(createPubStatWithReason(1000, 'bandwidth'));

      const result = calculateThroughput(state);

      expect(result.video.qualityLimitationReason).toBe('bandwidth');
    });
  });

  it('reports simulcast true when publisher stats have simulcast enabled', () => {
    const pubStatSimulcast = createPublisherStat(1000, { simulcastEnabled: true });
    state.subscriberStatsLog.push(
      createSubscriberStat(1000),
      createSubscriberStat(2000),
    );
    state.publisherStatsLog.push(pubStatSimulcast);

    const result = calculateThroughput(state);

    expect(result.audio.simulcast).toBe(true);
    expect(result.video.simulcast).toBe(true);
  });

  describe('publisherStatsList.forEach loop', () => {
    const twoSubscriberStats = () => [createSubscriberStat(1000), createSubscriberStat(2000)];

    describe('video path', () => {
      it('sets video bitrate to videoKbsSent x 1000 for a single publisher stat', () => {
        state.subscriberStatsLog.push(...twoSubscriberStats());
        state.publisherStatsLog.push(createPublisherStat(1000, { videoKbsSent: 600 }));

        const result = calculateThroughput(state);

        expect(result.video.bitrate).toBe(600 * 1000);
      });

      it('averages videoKbsSent x 1000 across multiple publisher stats', () => {
        state.subscriberStatsLog.push(...twoSubscriberStats());
        state.publisherStatsLog.push(
          createPublisherStat(1000, { videoKbsSent: 400 }),
          createPublisherStat(2000, { videoKbsSent: 600 }),
        );

        const result = calculateThroughput(state);

        expect(result.video.bitrate).toBe(500 * 1000);
      });
    });

    describe('audio path', () => {
      it('sets audio bitrate to audioStats[0].kbs x 1000 for a single publisher stat', () => {
        state.subscriberStatsLog.push(...twoSubscriberStats());
        state.publisherStatsLog.push(
          createPublisherStat(1000, { audioStats: [{ kbs: 80, byteSent: 400, currentTimestamp: 1000 }] }),
        );

        const result = calculateThroughput(state);

        expect(result.audio.bitrate).toBe(80 * 1000);
      });

      it('averages audioStats[0].kbs x 1000 across multiple publisher stats', () => {
        state.subscriberStatsLog.push(...twoSubscriberStats());
        state.publisherStatsLog.push(
          createPublisherStat(1000, { audioStats: [{ kbs: 60, byteSent: 300, currentTimestamp: 1000 }] }),
          createPublisherStat(2000, { audioStats: [{ kbs: 140, byteSent: 700, currentTimestamp: 2000 }] }),
        );

        const result = calculateThroughput(state);

        expect(result.audio.bitrate).toBe(100 * 1000);
      });

      it('uses 0 when audioStats is empty', () => {
        state.subscriberStatsLog.push(...twoSubscriberStats());
        state.publisherStatsLog.push(createPublisherStat(1000, { audioStats: [] }));

        const result = calculateThroughput(state);

        expect(result.audio.bitrate).toBe(0);
      });

      it('uses 0 for stats with empty audioStats and normal kbs for others when averaging', () => {
        state.subscriberStatsLog.push(...twoSubscriberStats());
        state.publisherStatsLog.push(
          createPublisherStat(1000, { audioStats: [] }),
          createPublisherStat(2000, { audioStats: [{ kbs: 200, byteSent: 1000, currentTimestamp: 2000 }] }),
        );

        const result = calculateThroughput(state);

        expect(result.audio.bitrate).toBe(100 * 1000);
      });
    });

    describe('sumPlr contribution', () => {
      it('publisher stats never contribute to packetLossRatio', () => {
        state.subscriberStatsLog.push(
          { ...createSubscriberStat(1000), audio: { bytesReceived: 1000, packetsLost: 0, packetsReceived: 100 } },
          { ...createSubscriberStat(2000), audio: { bytesReceived: 2000, packetsLost: 0, packetsReceived: 200 } },
        );
        state.publisherStatsLog.push(createPublisherStat(1000));

        const result = calculateThroughput(state);

        expect(result.audio.packetLossRatio).toBe(0);
      });
    });
  });
});
