import { type } from "arktype";
import { terminalColumnsSchema, terminalRowsSchema } from "@main/terminal/terminal-dimensions";
import { TERMINAL_KEYS } from "@main/terminal/terminal-input";
import { STREAM_CHANNELS } from "@shared/stream";

export const TERMINAL_WRITE_MAX_LENGTH = 65_536;

export const STREAM_MAX_PAYLOAD_BYTES = TERMINAL_WRITE_MAX_LENGTH * 8;

export const streamEnvelopeSchema = type({
	channel: type.enumerated(...STREAM_CHANNELS),
	type: "string",
	"payload?": "unknown",
	"requestId?": "string",
});

const shellAddress = type({ projectId: "string", shellId: "string" });

const shellInput = shellAddress.and({ cols: terminalColumnsSchema, rows: terminalRowsSchema });

export const TerminalSchemas = {
	open: shellInput,
	resume: shellInput,
	attach: shellAddress,
	write: type({ sessionId: "string", data: type("string").atMostLength(TERMINAL_WRITE_MAX_LENGTH) }),
	resize: type({ sessionId: "string", cols: terminalColumnsSchema, rows: terminalRowsSchema }),
	session: type({ sessionId: "string" }),
	prompt: shellAddress.and({ text: type("string").atMostLength(TERMINAL_WRITE_MAX_LENGTH) }),
	key: shellAddress.and({ key: type.enumerated(...TERMINAL_KEYS) }),
};

export const ActivitySchemas = {
	project: type({ projectId: "string" }),
	focusShell: type({ "shellId?": "string" }),
};

const conversationAddress = type({ shellId: "string", "agent?": "string" });

export const ConversationSchemas = {
	shell: conversationAddress,
	history: conversationAddress.and({
		before: type("number").narrow((value) => Number.isInteger(value) && value >= 0),
	}),
};

export const ReviewSchemas = {
	watch: type({ projectId: "string", "worktree?": "string" }),
};
