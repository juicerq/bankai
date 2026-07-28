import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, expect, test } from "bun:test";
import type { TerminalKey } from "@main/terminal/input";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileConversation } from "@renderer/routes/mobile/-components/mobile-conversation";
import { KEY_ACK_MS } from "@renderer/routes/mobile/-utils/use-key-ack";
import type { ShellAttention } from "@shared/activity";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;

const ASKING: ShellAttention = {
	message: "Claude needs your permission to use Bash",
	at: NOW,
	detail: "rm -rf out",
};

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
		trace: "Needs permission",
		traceSince: NOW,
		attention: undefined,
		...patch,
	};
}

function renderWaiting(options: { row?: SessionRow; onKey?: (key: TerminalKey) => Promise<void> } = {}) {
	const rendered = render(
		<MobileConversation
			shellId="s1"
			row={options.row ?? row({ attention: ASKING })}
			conversation={{ blocks: [], title: undefined, truncated: false, loading: false }}
			onBack={() => {}}
			onSend={async () => {}}
			onKey={options.onKey ?? (async () => {})}
		/>,
	);

	return {
		rerender: (next: SessionRow) =>
			rendered.rerender(
				<MobileConversation
					shellId="s1"
					row={next}
					conversation={{ blocks: [], title: undefined, truncated: false, loading: false }}
					onBack={() => {}}
					onSend={async () => {}}
					onKey={options.onKey ?? (async () => {})}
				/>,
			),
	};
}

function card() {
	return get("mobile-attention");
}

test("a labelled wait says what was asked and what it was asked about", () => {
	renderWaiting();

	expect(card().dataset.mode).toBe("card");
	expect(slot(card(), "message").textContent).toBe(ASKING.message);
	expect(slot(card(), "detail").textContent).toBe("rm -rf out");
});

test("the three answers send the strokes the TUI accepts", async () => {
	const pressed: TerminalKey[] = [];
	renderWaiting({ onKey: async (key) => void pressed.push(key) });

	fireEvent.click(slot(card(), "allow"));
	fireEvent.click(slot(card(), "always"));
	fireEvent.click(slot(card(), "deny"));

	await waitFor(() => expect(pressed).toEqual(["1", "2", "escape"]));
});

test("always says out loud that it lasts the whole session", () => {
	renderWaiting();

	expect(slot(card(), "always-note").textContent).toContain("rest of this session");
});

test("a wait nothing labelled falls back to the keypad under its category", () => {
	renderWaiting({ row: row({ trace: "Needs permission" }) });

	expect(card().dataset.mode).toBe("keypad");
	expect(slot(card(), "label").textContent).toBe("NEEDS PERMISSION");
	expect(slot(card(), "key-enter")).toBeDefined();
	expect(slot(card(), "key-up")).toBeDefined();
});

test("a shell that is not waiting is offered nothing above the composer", () => {
	renderWaiting({ row: row({ activity: "working", attention: ASKING }) });

	expect(query("mobile-attention")).toBeNull();
});

test("a stroke the agent answered never turns into a complaint", async () => {
	const { rerender } = renderWaiting();

	fireEvent.click(slot(card(), "allow"));
	rerender(row({ attention: ASKING, trace: "Running commands", traceSince: NOW + 200 }));
	await sleep(KEY_ACK_MS + 200);

	expect(card().dataset.mode).toBe("card");
	expect(() => slot(card(), "hint")).toThrow();
});

test("a stroke nothing answered admits it and hands over the keypad", async () => {
	renderWaiting();

	fireEvent.click(slot(card(), "allow"));

	await waitFor(() => expect(slot(card(), "hint").textContent).toContain("No effect"), { timeout: KEY_ACK_MS * 2 });
	expect(card().dataset.mode).toBe("keypad");
});

test("a stroke that never reached the agent says why instead of blaming the TUI", async () => {
	renderWaiting({
		onKey: async () => {
			throw new Error("This session is no longer running");
		},
	});

	fireEvent.click(slot(card(), "allow"));

	await waitFor(() => expect(slot(card(), "problem").textContent).toBe("This session is no longer running"));
	expect(card().dataset.mode).toBe("card");
});
