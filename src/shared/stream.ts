export const STREAM_CHANNELS = ["terminal", "activity", "review", "continuity", "conversation", "system"] as const;

export type StreamChannel = (typeof STREAM_CHANNELS)[number];

export const STREAM_REPLY = "reply";
export const STREAM_REJECT = "reject";
export const STREAM_HELLO = "hello";

export interface StreamHello {
	version: string;
}

export interface StreamEnvelope {
	channel: StreamChannel;
	type: string;
	payload?: unknown;
	requestId?: string;
}
