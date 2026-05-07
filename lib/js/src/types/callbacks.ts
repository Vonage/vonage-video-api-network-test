export type UpdateCallback = (stats: UpdateCallbackStats) => void;
export type UpdateCallbackStats = {
  audio: CallbackTrackStats;
  video: (CallbackTrackStats & { frameRate: number; mediaRouting?: string }) | null;
  timestamp: number;
  phase: string;
  networkCondition?: OT.NetworkCondition;
  networkDegradationSource?: OT.NetworkDegradationSource;
};

export interface CallbackTrackStats {
  bytesSent: number;
  bytesReceived: number;
  packetsLost: number;
  packetsReceived: number;
}
