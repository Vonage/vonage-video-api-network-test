import { getPublisherStats } from '../src/testQuality/helpers/getPublisherRtcStatsReport';
import { PublisherStats } from '../src/types/publisher';

/**
 * Builds a minimal RTCStatsReport map containing the provided stat entries.
 * Each entry must include at least `id` and `type`.
 */
function buildStatsReport(entries: Record<string, any>[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const entry of entries) {
    map.set(entry.id, entry);
  }
  return map;
}

/**
 * Creates a mock OT.Publisher with a `getRtcStatsReport` that resolves to
 * the provided RTCStatsReport map wrapped in the expected array structure.
 */
function createMockPublisher(statsReport: Map<string, any>): any {
  return {
    getRtcStatsReport: jasmine.createSpy('getRtcStatsReport').and.returnValue(
      Promise.resolve([{ rtcStatsReport: statsReport }])
    ),
  };
}

/** Base outbound-rtp stats for video so extractPublisherStats produces valid output */
function videoOutboundRtp(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'outbound-video-1',
    type: 'outbound-rtp',
    kind: 'video',
    ssrc: 1,
    bytesSent: 5000,
    timestamp: 2000,
    qualityLimitationReason: 'none',
    frameWidth: 640,
    frameHeight: 480,
    framesPerSecond: 30,
    active: true,
    pliCount: 0,
    nackCount: 0,
    ...overrides,
  };
}

/** Base outbound-rtp stats for audio */
function audioOutboundRtp(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'outbound-audio-1',
    type: 'outbound-rtp',
    kind: 'audio',
    ssrc: 2,
    bytesSent: 2000,
    timestamp: 2000,
    ...overrides,
  };
}

/** Creates a candidate-pair stat entry */
function candidatePair(
  id: string,
  availableOutgoingBitrate: number | undefined,
  opts: {
    nominated?: boolean;
    localCandidateId?: string;
    remoteCandidateId?: string;
    currentRoundTripTime?: number;
  } = {},
): Record<string, any> {
  return {
    id,
    type: 'candidate-pair',
    availableOutgoingBitrate,
    nominated: opts.nominated ?? false,
    localCandidateId: opts.localCandidateId ?? 'local-1',
    remoteCandidateId: opts.remoteCandidateId ?? 'remote-1',
    currentRoundTripTime: opts.currentRoundTripTime ?? 0.05,
  };
}

/** Creates a local-candidate stat entry */
function localCandidate(
  id: string,
  candidateType: string = 'host',
  protocol: string = 'udp',
): Record<string, any> {
  return {
    id,
    type: 'local-candidate',
    candidateType,
    protocol,
    address: '192.168.1.1',
    port: 5000,
    timestamp: 1000,
  };
}

/** Creates a remote-candidate stat entry */
function remoteCandidate(
  id: string,
  candidateType: string = 'host',
): Record<string, any> {
  return {
    id,
    type: 'remote-candidate',
    candidateType,
    protocol: 'udp',
    address: '10.0.0.1',
    port: 6000,
    timestamp: 1000,
  };
}

/** Creates a minimal previousStats to allow bitrate calculation */
function createPreviousStats(): PublisherStats {
  return {
    videoStats: [{
      ssrc: 1,
      byteSent: 1000,
      kbs: 0,
      qualityLimitationReason: 'none',
      resolution: '640x480',
      framerate: 30,
      active: true,
      pliCount: 0,
      nackCount: 0,
      currentTimestamp: 1000,
    }],
    audioStats: [{ kbs: 0, byteSent: 500, currentTimestamp: 1000 }],
    availableOutgoingBitrate: 500000,
    videoByteSent: 1000,
    videoKbsSent: 0,
    simulcastEnabled: false,
    transportProtocol: 'udp',
    currentRoundTripTime: 0.05,
    timestamp: 1000,
  };
}

describe('getPublisherRtcStatsReport', () => {

  describe('ICE candidate pair selection by availableOutgoingBitrate', () => {

    it('selects the candidate pair with the highest availableOutgoingBitrate', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-low', 100000, {
          nominated: true,
          localCandidateId: 'local-low',
          remoteCandidateId: 'remote-low',
        }),
        candidatePair('pair-high', 2000000, {
          nominated: false,
          localCandidateId: 'local-high',
          remoteCandidateId: 'remote-high',
        }),
        localCandidate('local-low', 'host', 'udp'),
        remoteCandidate('remote-low', 'host'),
        localCandidate('local-high', 'relay', 'udp'),
        remoteCandidate('remote-high', 'srflx'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      // The pair with highest bitrate is relay + srflx → should be Relayed (TURN/UDP)
      expect(result).toBeDefined();
      expect(result!.availableOutgoingBitrate).toBe(2000000);
      expect(result!.mediaRouting).toBe('Relayed (TURN/UDP)');
    });

    it('prefers a non-nominated pair with higher bitrate over a nominated pair with lower bitrate', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-nominated', 500000, {
          nominated: true,
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
        }),
        candidatePair('pair-active', 1500000, {
          nominated: false,
          localCandidateId: 'local-2',
          remoteCandidateId: 'remote-2',
        }),
        localCandidate('local-1', 'host', 'udp'),
        remoteCandidate('remote-1', 'host'),
        localCandidate('local-2', 'host', 'udp'),
        remoteCandidate('remote-2', 'host'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result).toBeDefined();
      expect(result!.availableOutgoingBitrate).toBe(1500000);
    });

    it('handles pairs where availableOutgoingBitrate is undefined (treated as 0)', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-undefined', undefined, {
          nominated: true,
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
        }),
        candidatePair('pair-with-bitrate', 800000, {
          nominated: false,
          localCandidateId: 'local-2',
          remoteCandidateId: 'remote-2',
        }),
        localCandidate('local-1', 'host', 'udp'),
        remoteCandidate('remote-1', 'host'),
        localCandidate('local-2', 'host', 'udp'),
        remoteCandidate('remote-2', 'host'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result).toBeDefined();
      expect(result!.availableOutgoingBitrate).toBe(800000);
    });

    it('returns -1 for availableOutgoingBitrate when no candidate pairs exist', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        // No candidate-pair entries
        localCandidate('local-1', 'host', 'udp'),
        remoteCandidate('remote-1', 'host'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result).toBeDefined();
      expect(result!.availableOutgoingBitrate).toBe(-1);
      expect(result!.mediaRouting).toBe('Unknown');
    });

    it('selects the only candidate pair when there is exactly one', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-only', 1200000, {
          nominated: true,
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
        }),
        localCandidate('local-1', 'host', 'udp'),
        remoteCandidate('remote-1', 'host'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result).toBeDefined();
      expect(result!.availableOutgoingBitrate).toBe(1200000);
      expect(result!.mediaRouting).toBe('Routed');
    });

    it('picks the first pair when multiple pairs have the same highest bitrate', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-a', 1000000, {
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
        }),
        candidatePair('pair-b', 1000000, {
          localCandidateId: 'local-2',
          remoteCandidateId: 'remote-2',
        }),
        localCandidate('local-1', 'host', 'udp'),
        remoteCandidate('remote-1', 'host'),
        localCandidate('local-2', 'relay', 'tcp'),
        remoteCandidate('remote-2', 'host'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result).toBeDefined();
      expect(result!.availableOutgoingBitrate).toBe(1000000);
      // When equal, the first pair wins (reduce keeps `best` when not strictly greater)
      // pair-a → local host + remote host = Routed
      expect(result!.mediaRouting).toBe('Routed');
    });

    it('handles all pairs having availableOutgoingBitrate of 0', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-a', 0, {
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
        }),
        candidatePair('pair-b', 0, {
          localCandidateId: 'local-2',
          remoteCandidateId: 'remote-2',
        }),
        localCandidate('local-1', 'host', 'udp'),
        remoteCandidate('remote-1', 'host'),
        localCandidate('local-2', 'host', 'udp'),
        remoteCandidate('remote-2', 'host'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result).toBeDefined();
      // When all pairs have 0 bitrate, none is > the initial null ?? 0 = 0,
      // so reduce returns null → availableOutgoingBitrate falls back to -1
      expect(result!.availableOutgoingBitrate).toBe(-1);
    });
  });

  describe('getPublisherStats edge cases', () => {

    it('returns undefined when publisher has no getRtcStatsReport method', async () => {
      const publisher = { getRtcStatsReport: 'not a function' } as any;
      const result = await getPublisherStats(publisher, undefined);
      expect(result).toBeUndefined();
    });

    it('returns undefined when getRtcStatsReport throws', async () => {
      const publisher = {
        getRtcStatsReport: jasmine.createSpy('getRtcStatsReport').and.returnValue(
          Promise.reject(new Error('stats unavailable'))
        ),
      } as any;
      const result = await getPublisherStats(publisher, undefined);
      expect(result).toBeUndefined();
    });

    it('returns undefined when getRtcStatsReport returns undefined', async () => {
      const publisher = {
        getRtcStatsReport: jasmine.createSpy('getRtcStatsReport').and.returnValue(
          Promise.resolve(undefined)
        ),
      } as any;
      const result = await getPublisherStats(publisher, undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('determineMediaRouting via candidate pair selection', () => {

    it('reports Routed when local=host and remote=host', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-1', 1000000, {
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
        }),
        localCandidate('local-1', 'host', 'udp'),
        remoteCandidate('remote-1', 'host'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result!.mediaRouting).toBe('Routed');
    });

    it('reports Relayed (TURN/UDP) when local=relay and protocol=udp', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-1', 1000000, {
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
        }),
        localCandidate('local-1', 'relay', 'udp'),
        remoteCandidate('remote-1', 'srflx'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result!.mediaRouting).toBe('Relayed (TURN/UDP)');
    });

    it('reports Relayed (TURN/TLS) when local=relay and protocol=tcp', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-1', 1000000, {
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
        }),
        localCandidate('local-1', 'relay', 'tcp'),
        remoteCandidate('remote-1', 'host'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result!.mediaRouting).toBe('Relayed (TURN/TLS)');
    });

    it('reports Relayed (STUN/UDP) when local=srflx and protocol=udp', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-1', 1000000, {
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
        }),
        localCandidate('local-1', 'srflx', 'udp'),
        remoteCandidate('remote-1', 'host'),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result!.mediaRouting).toBe('Relayed (STUN/UDP)');
    });

    it('reports Unknown when candidate pair has no matching local/remote candidates', async () => {
      const statsReport = buildStatsReport([
        videoOutboundRtp(),
        audioOutboundRtp(),
        candidatePair('pair-1', 1000000, {
          localCandidateId: 'local-missing',
          remoteCandidateId: 'remote-missing',
        }),
      ]);

      const publisher = createMockPublisher(statsReport);
      const result = await getPublisherStats(publisher, createPreviousStats());

      expect(result!.mediaRouting).toBe('Unknown');
    });
  });
});
