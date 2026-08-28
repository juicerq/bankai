import { type } from "arktype";

const STREAM_CHANNELS = [
	"terminal",
	"activity",
	"review",
	"continuity",
	"conversation",
	"services",
	"system",
] as const;

export type StreamChannel = (typeof STREAM_CHANNELS)[number];

export const STREAM_REPLY = "reply";
export const STREAM_REJECT = "reject";
export const STREAM_HELLO = "hello";

export const streamHelloSchema = type({ protocol: "number", version: "string" });
export const streamVoidSchema = type("undefined");

export const streamEnvelopeSchema = type({
	channel: type.enumerated(...STREAM_CHANNELS),
	type: "string",
	"payload?": "unknown",
	"requestId?": "string",
});

export type StreamHello = typeof streamHelloSchema.infer;

export type StreamEnvelope = typeof streamEnvelopeSchema.infer;
