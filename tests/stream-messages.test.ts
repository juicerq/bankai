import { describe, expect, test } from "bun:test";
import {
	ConversationSchemas,
	streamEnvelopeSchema,
	TERMINAL_WRITE_MAX_LENGTH,
	TerminalSchemas,
} from "@main/server/stream/messages";
import { TERMINAL_MAX_COLUMNS } from "@main/terminal/dimensions";

describe("the envelope every client message arrives in", () => {
	test("a request carries its channel, type and correlation id", () => {
		expect(
			streamEnvelopeSchema.assert({
				channel: "terminal",
				type: "open",
				payload: { shellId: "s1" },
				requestId: "7",
			}),
		).toEqual({ channel: "terminal", type: "open", payload: { shellId: "s1" }, requestId: "7" });
	});

	test("a fire-and-forget message needs neither payload nor correlation id", () => {
		expect(streamEnvelopeSchema.assert({ channel: "continuity", type: "subscribe" })).toEqual({
			channel: "continuity",
			type: "subscribe",
		});
	});

	test("a channel nobody serves is refused", () => {
		expect(() => streamEnvelopeSchema.assert({ channel: "diagnostics", type: "subscribe" })).toThrow();
	});

	test("the conversation channel is now one of the served ones", () => {
		expect(streamEnvelopeSchema.assert({ channel: "conversation", type: "subscribe" })).toEqual({
			channel: "conversation",
			type: "subscribe",
		});
	});
});

describe("what a client may ask the terminal to do", () => {
	test("a write at the cap is accepted", () => {
		const data = "x".repeat(TERMINAL_WRITE_MAX_LENGTH);

		expect(TerminalSchemas.write.assert({ sessionId: "s1", data })).toEqual({ sessionId: "s1", data });
	});

	test("a write past the cap is refused", () => {
		expect(() =>
			TerminalSchemas.write.assert({ sessionId: "s1", data: "x".repeat(TERMINAL_WRITE_MAX_LENGTH + 1) })
		).toThrow();
	});

	test("opening a shell needs a usable terminal size", () => {
		expect(() =>
			TerminalSchemas.open.assert({ projectId: "p1", shellId: "s1", cols: TERMINAL_MAX_COLUMNS + 1, rows: 24 })
		).toThrow();
	});

	test("detaching only needs the session it is letting go of", () => {
		expect(TerminalSchemas.session.assert({ sessionId: "s1" })).toEqual({ sessionId: "s1" });
	});

	test("a prompt is addressed to a shell, not to a terminal the phone never opened", () => {
		expect(TerminalSchemas.prompt.assert({ projectId: "p1", shellId: "s1", text: "duas\nlinhas" })).toEqual({
			projectId: "p1",
			shellId: "s1",
			text: "duas\nlinhas",
		});
		expect(() => TerminalSchemas.prompt.assert({ shellId: "s1", text: "oi" })).toThrow();
	});

	test("only a key the main process knows how to translate is accepted", () => {
		expect(TerminalSchemas.key.assert({ projectId: "p1", shellId: "s1", key: "escape" })).toEqual({
			projectId: "p1",
			shellId: "s1",
			key: "escape",
		});
		expect(() => TerminalSchemas.key.assert({ projectId: "p1", shellId: "s1", key: "f13" })).toThrow();
	});
});

describe("what a client may ask a conversation for", () => {
	test("a subscription names the shell whose transcript it wants", () => {
		expect(ConversationSchemas.shell.assert({ shellId: "s1" })).toEqual({ shellId: "s1" });
		expect(() => ConversationSchemas.shell.assert({})).toThrow();
	});

	test("a step back names the offset it wants to read before", () => {
		expect(ConversationSchemas.history.assert({ shellId: "s1", before: 524_288 })).toEqual({
			shellId: "s1",
			before: 524_288,
		});
		expect(() => ConversationSchemas.history.assert({ shellId: "s1", before: -1 })).toThrow();
		expect(() => ConversationSchemas.history.assert({ shellId: "s1", before: 1.5 })).toThrow();
		expect(() => ConversationSchemas.history.assert({ shellId: "s1" })).toThrow();
	});
});
