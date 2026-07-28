export const STREAM_CHANNELS = ["terminal", "activity", "review", "continuity"] as const;

export type StreamChannel = (typeof STREAM_CHANNELS)[number];

export const STREAM_REPLY = "reply";
export const STREAM_REJECT = "reject";

export interface StreamEnvelope {
	channel: StreamChannel;
	type: string;
	payload?: unknown;
	requestId?: string;
}
