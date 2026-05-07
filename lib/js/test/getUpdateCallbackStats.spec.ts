import getUpdateCallbackStats from '../src/testQuality/helpers/getUpdateCallbackStats';
import { PublisherStats } from '../src/types/publisher';

function createPublisherStats(overrides: Partial<PublisherStats> = {}): PublisherStats {
  return {
    videoStats: [{
      ssrc: 1,
      byteSent: 2000,
      kbs: 200,
      qualityLimitationReason: 'none',
      resolution: '1280x720',
      framerate: 30,
      active: true,
      pliCount: 0,
      nackCount: 0,
      currentTimestamp: 1000,
    }],
    audioStats: [{ kbs: 50, byteSent: 500, currentTimestamp: 1000 }],
    availableOutgoingBitrate: 2000000,
    videoByteSent: 2000,
    videoKbsSent: 200,
    simulcastEnabled: false,
    transportProtocol: 'udp',
    currentRoundTripTime: 0.05,
    timestamp: 1000,
    mediaRouting: 'Relayed (TURN/UDP)',
    ...overrides,
  };
}

function createSubscriberStats(
  mediaLink?: OT.SubscriberMediaLink,
): OT.SubscriberStats {
  const stats: any = {
    audio: {
      bytesReceived: 3000,
      packetsLost: 2,
      packetsReceived: 98,
    },
    video: {
      bytesReceived: 12000,
      packetsLost: 1,
      packetsReceived: 199,
      frameRate: 25,
      codec: 'VP8',
      width: 1280,
      height: 720,
      bitrate: 800000,
      totalBitrate: 850000,
      decodedFrameRate: 24,
    },
    timestamp: 5000,
  };
  if (mediaLink !== undefined) {
    stats.mediaLink = mediaLink;
  }
  return stats as OT.SubscriberStats;
}

function makeMediaLink(
  networkCondition: OT.NetworkCondition,
  networkDegradationSource: OT.NetworkDegradationSource = 'none',
): OT.SubscriberMediaLink {
  return {
    transport: {
      networkCondition,
      networkConditionReason: 'none',
      connectionEstimatedBandwidth: 5000000,
    },
    remotePublisherTransport: {
      networkCondition: 'excellent',
      networkConditionReason: 'none',
      connectionEstimatedBandwidth: 5000000,
    },
    networkDegradationSource,
  };
}

describe('getUpdateCallbackStats', () => {
  describe('audio-video phase', () => {
    it('returns the correct phase', () => {
      const result = getUpdateCallbackStats(createSubscriberStats(), createPublisherStats(), 'audio-video');
      expect(result.phase).toBe('audio-video');
    });

    it('maps subscriber audio stats correctly', () => {
      const result = getUpdateCallbackStats(createSubscriberStats(), createPublisherStats(), 'audio-video');
      expect(result.audio.bytesReceived).toBe(3000);
      expect(result.audio.packetsLost).toBe(2);
      expect(result.audio.packetsReceived).toBe(98);
    });

    it('maps publisher audio bytesSent into audio callback stats', () => {
      const result = getUpdateCallbackStats(createSubscriberStats(), createPublisherStats(), 'audio-video');
      expect(result.audio.bytesSent).toBe(500);
    });

    it('populates video stats in audio-video phase', () => {
      const result = getUpdateCallbackStats(createSubscriberStats(), createPublisherStats(), 'audio-video');
      expect(result.video).not.toBeNull();
      expect(result.video!.bytesReceived).toBe(12000);
      expect(result.video!.packetsLost).toBe(1);
      expect(result.video!.packetsReceived).toBe(199);
      expect(result.video!.frameRate).toBe(25);
      expect(result.video!.bytesSent).toBe(2000);
      expect(result.video!.mediaRouting).toBe('Relayed (TURN/UDP)');
    });

    it('uses the subscriber stats timestamp', () => {
      const result = getUpdateCallbackStats(createSubscriberStats(), createPublisherStats(), 'audio-video');
      expect(result.timestamp).toBe(5000);
    });
  });

  describe('audio-only phase', () => {
    it('returns null for video in audio-only phase', () => {
      const result = getUpdateCallbackStats(createSubscriberStats(), createPublisherStats(), 'audio-only');
      expect(result.video).toBeNull();
    });

    it('still returns audio stats in audio-only phase', () => {
      const result = getUpdateCallbackStats(createSubscriberStats(), createPublisherStats(), 'audio-only');
      expect(result.audio.bytesReceived).toBe(3000);
    });
  });

  describe('networkCondition', () => {
    it('is undefined when subscriberStats has no mediaLink', () => {
      const result = getUpdateCallbackStats(createSubscriberStats(), createPublisherStats(), 'audio-video');
      expect(result.networkCondition).toBeUndefined();
    });

    it('is set to the value from mediaLink.transport.networkCondition', () => {
      const stats = createSubscriberStats(makeMediaLink('good'));
      const result = getUpdateCallbackStats(stats, createPublisherStats(), 'audio-video');
      expect(result.networkCondition).toBe('good');
    });

    it('reflects each possible NetworkCondition value', () => {
      const conditions: OT.NetworkCondition[] = ['excellent', 'good', 'fair', 'warning', 'critical', 'unknown'];
      for (const condition of conditions) {
        const stats = createSubscriberStats(makeMediaLink(condition));
        const result = getUpdateCallbackStats(stats, createPublisherStats(), 'audio-video');
        expect(result.networkCondition).toBe(condition);
      }
    });

    it('is available in audio-only phase as well', () => {
      const stats = createSubscriberStats(makeMediaLink('fair'));
      const result = getUpdateCallbackStats(stats, createPublisherStats(), 'audio-only');
      expect(result.networkCondition).toBe('fair');
    });
  });

  describe('networkDegradationSource', () => {
    it('is undefined when subscriberStats has no mediaLink', () => {
      const result = getUpdateCallbackStats(createSubscriberStats(), createPublisherStats(), 'audio-video');
      expect(result.networkDegradationSource).toBeUndefined();
    });

    it('is set to the value from mediaLink.networkDegradationSource', () => {
      const stats = createSubscriberStats(makeMediaLink('warning', 'local'));
      const result = getUpdateCallbackStats(stats, createPublisherStats(), 'audio-video');
      expect(result.networkDegradationSource).toBe('local');
    });

    it('reflects each possible NetworkDegradationSource value', () => {
      const sources: OT.NetworkDegradationSource[] = ['none', 'local', 'remote', 'bothOrUnclear'];
      for (const source of sources) {
        const stats = createSubscriberStats(makeMediaLink('warning', source));
        const result = getUpdateCallbackStats(stats, createPublisherStats(), 'audio-video');
        expect(result.networkDegradationSource).toBe(source);
      }
    });
  });

  describe('when both networkCondition and networkDegradationSource are present', () => {
    it('includes both fields in the result', () => {
      const stats = createSubscriberStats(makeMediaLink('critical', 'remote'));
      const result = getUpdateCallbackStats(stats, createPublisherStats(), 'audio-video');
      expect(result.networkCondition).toBe('critical');
      expect(result.networkDegradationSource).toBe('remote');
    });
  });
});
