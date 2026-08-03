import { afterEach, expect, test } from "bun:test";
import type { TerminalKey } from "@main/terminal/terminal-input";
import { ACTIVITY_LABEL } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileConversation } from "@renderer/routes/mobile/-components/mobile-conversation";
import { KEY_ACK_MS, useKeyAck } from "@renderer/routes/mobile/-utils/use-key-ack";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;
const ACK_MS = 20;

function row(patch: Partial<SessionRow> = {}): SessionRow {
	return {
		shellId: "s1",
		projectId: "p1",
		projectName: "bankai",
		title: "retry no upload",
		branch: "fix/upload",
		harness: "claude",
		createdAt: NOW,
		lastTouchedAt: NOW,
		archivedAt: undefined,
		activity: "needs-attention",
		since: NOW,
		...patch,
	};
}

function renderWaiting(options: { row?: SessionRow; onKey?: (key: TerminalKey) => Promise<void> } = {}) {
	render(
		<MobileConversation
			shellId="s1"
			session={{
				row: options.row ?? row(),
				onSend: async () => {},
				onKey: options.onKey ?? (async () => {}),
			}}
			conversation={{
				blocks: [],
				title: undefined,
				atStart: false,
				loading: false,
				loadingOlder: false,
				loadOlder: async () => {},
			}}
			onBack={() => {}}
		/>,
	);
}

function card() {
	return get("mobile-attention");
}

test("every wait is offered the keypad under its category", () => {
	renderWaiting();

	expect(slot(card(), "label").textContent).toBe(ACTIVITY_LABEL["needs-attention"]);
	expect(slot(card(), "label").className).toContain("uppercase");
	expect(slot(card(), "key-enter")).toBeDefined();
	expect(slot(card(), "key-up").getAttribute("aria-label")).toBe("Up");
});

test("the keypad sends the strokes the TUI accepts", async () => {
	const pressed: TerminalKey[] = [];
	renderWaiting({ onKey: async (key) => void pressed.push(key) });

	fireEvent.click(slot(card(), "key-1"));
	fireEvent.click(slot(card(), "key-enter"));
	fireEvent.click(slot(card(), "key-escape"));

	await waitFor(() => expect(pressed).toEqual(["1", "enter", "escape"]));
});

test("a shell that is not waiting is offered nothing above the composer", () => {
	renderWaiting({ row: row({ activity: "working" }) });

	expect(query("mobile-attention")).toBeNull();
});

test("a stroke nothing answered admits it", async () => {
	renderWaiting();

	fireEvent.click(slot(card(), "key-1"));

	await waitFor(() => expect(slot(card(), "hint").textContent).toContain("No effect"), { timeout: KEY_ACK_MS * 2 });
});

test("a stroke that never reached the agent says why instead of blaming the TUI", async () => {
	renderWaiting({
		onKey: async () => {
			throw new Error("This session is no longer running");
		},
	});

	fireEvent.click(slot(card(), "key-1"));

	await waitFor(() => expect(slot(card(), "problem").textContent).toBe("This session is no longer running"));
});

function renderAck(send: (key: TerminalKey) => Promise<void> = async () => {}) {
	return renderHook(({ signature }: { signature: string }) => useKeyAck(signature, send, ACK_MS), {
		initialProps: { signature: "waiting" },
	});
}

test("a stroke the agent answered never turns into a complaint", async () => {
	const { result, rerender } = renderAck();

	await act(() => result.current.press("1"));
	rerender({ signature: "running" });
	await act(() => Bun.sleep(ACK_MS * 3));

	expect(result.current.deaf).toBe(false);
});

test("a stroke nothing answered marks the wait it was aimed at as deaf", async () => {
	const { result } = renderAck();

	await act(() => result.current.press("1"));
	await waitFor(() => expect(result.current.deaf).toBe(true));
});

test("the next wait is heard again, however many strokes the last one swallowed", async () => {
	const { result, rerender } = renderAck();

	await act(() => result.current.press("1"));
	await waitFor(() => expect(result.current.deaf).toBe(true));

	rerender({ signature: "asking again" });

	expect(result.current.deaf).toBe(false);
});
