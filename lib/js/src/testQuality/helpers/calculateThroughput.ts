import getLatestSampleWindow from './getLatestSampleWindow';
import calculateQualityStats from './calculateQualityStats';
import getVideoQualityEvaluation from './getVideoQualityEvaluation';
import { AV, AverageStats, AverageStatsBase, HasAudioVideo, SubscriberQualityStats } from '../types/stats';
import config from './config';
import MOSState from './MOSState';
import { PublisherStats } from '../../types/publisher';
import { getOr } from '../../util';

function getAverageBitrateAndPlr(type: AV,
                                 subscriberStatsList: SubscriberQualityStats[],
                                 publisherStatsList: PublisherStats[]): AverageStats {

  let sumBps = 0;
  let sumPlr = 0;
  let sumFrameRate = 0;

  publisherStatsList.forEach((stat) => {
    sumPlr += 0;
    if (type === 'video') {
      sumBps += stat.videoKbsSent * 1000;
    } else {
      sumBps += (stat.audioStats[0]?.kbs ?? 0) * 1000;
    }
  });

  subscriberStatsList.forEach((stat) => {
    sumPlr += stat.packetLossRatio;
    if (type === 'video') {
      sumFrameRate += Number(getOr(0, 'frameRate', stat));
    }
  });

  const isSimulcastEnabled = publisherStatsList.some(
    publisherStats => publisherStats.simulcastEnabled,
  );

  /**
   * Determines the sustained `qualityLimitationReason` across all samples in the
   * current measurement window.
   *
   * @remarks
   * The WebRTC encoder can transiently report `"bandwidth"` during ramp-up or
   * brief bitrate estimate fluctuations — even when no real constraint exists.
   * Snapshotting only the last sample (previous behaviour) made the result
   * susceptible to these spikes.
   *
   * By requiring the reason to appear in **more than half** of the samples we
   * ensure only a sustained, genuine limitation is surfaced. A transient spike
   * in 1 of 10 samples is suppressed; a real constraint present in 6 of 10 is
   * reported correctly.
   *
   * @returns The most frequently occurring non-trivial reason if it exceeds the
   * majority threshold, otherwise `undefined`.
   */
  const qualityLimitationCounts: Record<string, number> = {};
  for (const publisherStats of publisherStatsList) {
    const reason = publisherStats.videoStats.find(
      videoStats => videoStats.qualityLimitationReason != null
        && videoStats.qualityLimitationReason !== 'none'
    )?.qualityLimitationReason;
    if (reason) {
      if (!qualityLimitationCounts[reason]) qualityLimitationCounts[reason] = 0;
      qualityLimitationCounts[reason] += 1;
    }
  }
  const majorityThreshold = publisherStatsList.length / 2;
  const qualityLimitationReason = Object.entries(qualityLimitationCounts).find(([, count]) => {
    return count > majorityThreshold;
  })?.[0] ?? undefined;

  const averageStats: AverageStatsBase = {
    availableOutgoingBitrate: publisherStatsList[publisherStatsList.length - 1].availableOutgoingBitrate,
    simulcast: isSimulcastEnabled,
    bitrate: sumBps / publisherStatsList.length,
    packetLossRatio: sumPlr / subscriberStatsList.length,
  };

  if (type === 'video') {
    const { supported, reason, recommendedResolution, recommendedFrameRate } =
      getVideoQualityEvaluation(averageStats);

    const videoStats =
      type === 'video' ? {
        recommendedResolution,
        recommendedFrameRate,
        frameRate: sumFrameRate / subscriberStatsList.length,
      } : {};
    return { ...averageStats, supported, reason, qualityLimitationReason, ...videoStats };
  }
  return { ...averageStats };
}

export default function calculateThroughput(state: MOSState): HasAudioVideo<AverageStats> {

  const sampleWindow = getLatestSampleWindow(state.publisherStatsLog);
  const subscriberQualityStats = calculateQualityStats(state.subscriberStatsLog);

  const averageAudioStats = () => {
    if (!state.hasAudioTrack()) {
      return {
        supported: false,
        reason: config.strings.noMic,
      };
    }
    return getAverageBitrateAndPlr('audio', subscriberQualityStats.audio, sampleWindow);
  };

  const averageVideoStats = () => {
    if (state.audioOnlyFallback) {
      return {
        supported: false,
        reason: config.strings.bandwidthLow,
      };
    }
    if (!state.hasVideoTrack()) {
      return {
        supported: false,
        reason: config.strings.noCam,
      };
    }
    return getAverageBitrateAndPlr('video', subscriberQualityStats.video, sampleWindow);
  };

  return {
    audio: averageAudioStats(),
    video: averageVideoStats(),
  };
}
