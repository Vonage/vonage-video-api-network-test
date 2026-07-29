import { PublisherStats } from '../../types/publisher';
import { RTCIceCandidateStats, MediaRouting } from '../../types/rtcStats';

export interface PreviousStreamStats {
  [ssrc: number]: {
    timestamp: number;
    bytesSent: number;
  };
}

export async function getPublisherStats(
  publisher: OT.Publisher,
  previousStats: PublisherStats | undefined,
): Promise<PublisherStats | undefined> {

  if (typeof publisher.getRtcStatsReport !== 'function') {
    return undefined;
  }

  try {
    const publisherStatsReport = await publisher.getRtcStatsReport();
    return extractPublisherStats(publisherStatsReport, previousStats) ?? undefined;
  } catch (error) {
    return undefined;
  }
}

const calculateAudioBitrate = (
  stats: RTCOutboundRtpStreamStats,
  previousStats: PublisherStats | undefined,
): number => {
  const previousSsrcFrameData = previousStats?.audioStats[0];
  if (!previousSsrcFrameData) {
    return 0;
  }

  const { currentTimestamp: previousTimestamp, byteSent: previousByteSent } = previousSsrcFrameData;
  if (stats.bytesSent == null) {
    return 0;
  }
  const byteSent = stats.bytesSent - previousByteSent;
  const timeDiff = (stats.timestamp - previousTimestamp) / 1000; // Convert to seconds

  return Math.round((byteSent * 8) / (1000 * timeDiff)); // Convert to bits per second
};

const calculateVideoBitrate = (
  stats: RTCOutboundRtpStreamStats,
  previousStats: PublisherStats | undefined,
): number => {
  const previousSsrcFrameData = previousStats?.videoStats.find(videoStats => videoStats.ssrc === stats.ssrc);
  if (!previousSsrcFrameData) {
    return 0;
  }

  const { currentTimestamp: previousTimestamp, byteSent: previousByteSent } = previousSsrcFrameData;
  if (stats.bytesSent == null) {
    return 0;
  }
  const byteSent = stats.bytesSent - previousByteSent;
  const timeDiff = (stats.timestamp - previousTimestamp) / 1000; // Convert to seconds

  return Math.round((byteSent * 8) / (1000 * timeDiff)); // Convert to kbit per second
};

/**
 * Classifies the media routing path from the active ICE candidate pair.
 *
 * @param localCandidate - Local ICE candidate from the active pair, or `null`
 *   if stats are not yet available (valid transient state during ICE ramp-up).
 * @param remoteCandidate - Remote ICE candidate from the active pair, or `null`.
 * @returns A {@link MediaRouting} string — `'Unknown'` when either candidate is `null`.
 *
 * @remarks
 * | Local type | Remote type | Result |
 * |---|---|---|
 * | `host` / `prflx` | `host` | `'Routed'` |
 * | `relay` | any | `'Relayed (TURN/UDP)'` or `'Relayed (TURN/TCP)'` |
 * | `srflx` / `prflx` | any | `'Relayed (STUN)'` |
 */
const determineMediaRouting = (
  localCandidate: RTCIceCandidateStats | null,
  remoteCandidate: RTCIceCandidateStats | null,
): MediaRouting => {
  if (!localCandidate || !remoteCandidate) {
    return 'Unknown';
  }

  const localType = localCandidate.candidateType;
  const remoteType = remoteCandidate.candidateType;
  const protocol = (localCandidate.protocol || '').toLowerCase();

  if (localType === 'host' && remoteType === 'host') {
    return 'Routed';
  }

  if ((localType === 'prflx' || localType === 'host') && remoteType === 'host') {
    return 'Routed';
  }

  const isTcp = protocol === 'tcp';

  if (localType === 'relay' || remoteType === 'relay') {
    return isTcp ? 'Relayed (TURN/TLS)' : 'Relayed (TURN/UDP)';
  }

  if (localType === 'srflx' || remoteType === 'srflx') {
    return isTcp ? 'Relayed (STUN/TLS)' : 'Relayed (STUN/UDP)';
  }

  if (localType === 'prflx' || remoteType === 'prflx') {
    return isTcp ? 'Relayed (STUN/TLS)' : 'Relayed (STUN/UDP)';
  }
  return 'Unknown';
};

const extractOutboundRtpStats = (
  outboundRtpStats: (RTCOutboundRtpStreamStats & {
    mediaType?: 'video' | 'audio';
    qualityLimitationReason?: string;
    active?: boolean;
  })[],
  previousStats?: PublisherStats
) => {
  const videoStats = [];
  const audioStats = [];
  for (const stats of outboundRtpStats) {
    if (stats.kind === 'video' || stats.mediaType === 'video') {
      const kbs = calculateVideoBitrate(stats, previousStats);
      const { ssrc, timestamp: currentTimestamp } = stats;
      const baseStats = { kbs, ssrc, byteSent: stats.bytesSent ?? 0, currentTimestamp };
      videoStats.push({
        ...baseStats,
        qualityLimitationReason: stats.qualityLimitationReason,
        resolution: `${stats.frameWidth || 0}x${stats.frameHeight || 0}`,
        framerate: stats.framesPerSecond || 0,
        active: stats.active || false,
        pliCount: stats.pliCount || 0,
        nackCount: stats.nackCount || 0,
      });
    } else if (stats.kind === 'audio' || stats.mediaType === 'audio') {
      const kbs = calculateAudioBitrate(stats, previousStats);
      const { ssrc, timestamp: currentTimestamp } = stats;
      const baseStats = { kbs, ssrc, byteSent: stats.bytesSent ?? 0, currentTimestamp };
      audioStats.push(baseStats);
    }
  }

  return { videoStats, audioStats };
};

const extractPublisherStats = (
  publisherRtcStatsReport?: OT.PublisherRtcStatsReportArr,
  previousStats?: PublisherStats,
): PublisherStats | undefined => {
  if (!publisherRtcStatsReport) {
    return undefined;
  }

  const { rtcStatsReport } = publisherRtcStatsReport[0];

  const rtcStatsArray: RTCStats[] = Array.from(rtcStatsReport.values());

  const outboundRtpStats = rtcStatsArray.filter(
    stats => stats.type === 'outbound-rtp') as RTCOutboundRtpStreamStats[];

  /**
   * Selects the active ICE candidate pair by picking the one with the highest
   * `availableOutgoingBitrate`. This is more reliable than filtering by `nominated`
   * because in routed (SFU) sessions the browser may not set the `nominated` flag
   * on the active pair, yet will always populate `availableOutgoingBitrate` on the
   * pair that is currently carrying traffic.
   *
   * @remarks
   * - **P2P / relayed**: the nominated pair always has the highest bitrate — result
   *   is identical to a `nominated` filter.
   * - **SFU / routed**: the active pair has a non-zero bitrate even without `nominated`.
   * - `availableOutgoingBitrate` defaults to `0` when absent so unpopulated pairs
   *   are always ranked below any pair actively sending data.
   */
  const iceCandidatePairStats = (rtcStatsArray
    .filter((stats) => stats.type === 'candidate-pair') as RTCIceCandidatePairStats[])
    .reduce<RTCIceCandidatePairStats | null>(
    (best, pair) =>
      (pair.availableOutgoingBitrate ?? 0) > (best?.availableOutgoingBitrate ?? 0)
        ? pair
        : best,
    null
  );


  const findCandidateById = (type: string, id: string) => {
    return rtcStatsArray.find(stats => stats.type === type && stats.id === id) as RTCIceCandidateStats | null;
  };

  const localCandidate = iceCandidatePairStats?.localCandidateId
    ? findCandidateById('local-candidate', iceCandidatePairStats.localCandidateId)
    : null;
  const remoteCandidate = iceCandidatePairStats?.remoteCandidateId
    ? findCandidateById('remote-candidate', iceCandidatePairStats.remoteCandidateId)
    : null;

  const { videoStats, audioStats } = extractOutboundRtpStats(outboundRtpStats, previousStats);

  const mediaRouting = determineMediaRouting(localCandidate, remoteCandidate);
  const availableOutgoingBitrate = iceCandidatePairStats?.availableOutgoingBitrate || -1;
  const currentRoundTripTime = iceCandidatePairStats?.currentRoundTripTime || -1;
  const videoKbsSent = videoStats.reduce((sum, stats) => sum + stats.kbs, 0);
  const videoByteSent = videoStats.reduce((sum, stats) => sum + stats.byteSent, 0);
  const simulcastEnabled = videoStats.length > 1;
  const transportProtocol = localCandidate?.protocol || 'N/A';
  const timestamp = localCandidate?.timestamp || 0;

  return {
    videoStats,
    audioStats,
    availableOutgoingBitrate,
    videoByteSent,
    videoKbsSent,
    simulcastEnabled,
    transportProtocol,
    currentRoundTripTime,
    timestamp,
    mediaRouting,
  };
};
