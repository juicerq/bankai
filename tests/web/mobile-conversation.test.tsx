import { afterEach, expect, test } from "bun:test";
import type { TerminalKey } from "@main/terminal/input";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileConversation } from "@renderer/routes/mobile/-components/mobile-conversation";
import type { ConversationView } from "@renderer/routes/mobile/-utils/use-conversation";
import type { ConversationBlock } from "@shared/conversation";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;

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
		activity: undefined,
		trace: undefined,
		traceSince: undefined,
		attention: undefined,
		...patch,
	};
}

function view(blocks: ConversationBlock[], patch: Partial<ConversationView> = {}): ConversationView {
	return { blocks, title: undefined, truncated: false, loading: false, ...patch };
}

function renderConversation(
	options: {
		row?: SessionRow | undefined;
		conversation?: ConversationView;
		onSend?: (text: string) => Promise<void>;
		onKey?: (key: TerminalKey) => Promise<void>;
		onBack?: () => void;
	} = {},
) {
	return render(
		<MobileConversation
			shellId="s1"
			row={"row" in options ? options.row : row()}
			conversation={options.conversation ?? view([])}
			onBack={options.onBack ?? (() => {})}
			onSend={options.onSend ?? (async () => {})}
			onKey={options.onKey ?? (async () => {})}
		/>,
	);
}

function blocks() {
	return [...document.querySelectorAll<HTMLElement>('[data-component="conversation-block"]')];
}

function block(index: number) {
	const found = blocks()[index];
	if (!found) {
		throw new Error(`Expected a conversation block at ${index}`);
	}

	return found;
}

function composer() {
	return get("mobile-composer");
}

function field() {
	const element = slot(composer(), "input");
	if (!(element instanceof HTMLTextAreaElement)) {
		throw new Error("The composer input is not a textarea");
	}

	return element;
}

function sendButton() {
	const element = slot(composer(), "send");
	if (!(element instanceof HTMLButtonElement)) {
		throw new Error("The send action is not a button");
	}

	return element;
}

test("the conversation paints its blocks in the order the file wrote them", () => {
	renderConversation({
		conversation: view([
			{ kind: "user", id: "u1", text: "adiciona retry" },
			{ kind: "tool", id: "t1", label: "Reading upload.ts", state: "done" },
			{ kind: "agent", id: "m1", text: "O upload não tem retry." },
		]),
	});

	expect(blocks().map((block) => block.dataset.kind)).toEqual(["user", "tool", "agent"]);
	expect(block(0).textContent).toContain("adiciona retry");
	expect(block(2).textContent).toBe("O upload não tem retry.");
});

test("a running tool pulses and a failed one turns red", () => {
	renderConversation({
		conversation: view([
			{ kind: "tool", id: "t1", label: "Running commands", state: "running" },
			{ kind: "tool", id: "t2", label: "Editing files", state: "failed" },
		]),
	});

	expect(slot(block(0), "tool-dot").className).toContain("pending-pulse");
	expect(slot(block(1), "tool-dot").className).toContain("bg-removed");
	expect(block(1).className).toContain("text-removed");
});

test("a compaction and an interruption read as markers, not as messages", () => {
	renderConversation({
		conversation: view([{ kind: "compacted", id: "c1" }, { kind: "interrupted", id: "i1" }]),
	});

	expect(block(0).textContent).toContain("CONVERSATION COMPACTED");
	expect(block(1).textContent).toContain("INTERRUPTED");
});

test("a cut history says so above the oldest block", () => {
	renderConversation({ conversation: view([{ kind: "user", id: "u1", text: "oi" }], { truncated: true }) });

	expect(slot(get("mobile-conversation"), "truncated").textContent).toContain("HISTORY TRUNCATED");
});

test("the parsed title wins over the session name, and the trace stays visible", () => {
	renderConversation({
		row: row({ activity: "working", trace: "Editing files", traceSince: Date.now() - 74_000 }),
		conversation: view([], { title: "Retry no upload de fotos" }),
	});

	expect(slot(get("mobile-conversation"), "title").textContent).toBe("Retry no upload de fotos");
	expect(slot(get("mobile-conversation"), "activity").textContent).toContain("Editing files");
	expect(slot(get("mobile-conversation"), "session-elapsed").textContent).toContain("1m");
});

test("the back chevron returns to the list", () => {
	let backs = 0;
	renderConversation({ onBack: () => backs++ });

	fireEvent.click(slot(get("mobile-conversation"), "back"));

	expect(backs).toBe(1);
});

test("the composer sends what was typed and empties itself", async () => {
	const sent: string[] = [];
	renderConversation({ onSend: async (text) => void sent.push(text) });

	const input = field();
	fireEvent.input(input, { target: { value: "primeira\nsegunda" } });
	fireEvent.click(slot(composer(), "send"));

	await waitFor(() => expect(sent).toEqual(["primeira\nsegunda"]));
	expect(input.value).toBe("");
});

test("a prompt that never reached the agent keeps the text and says why", async () => {
	renderConversation({
		onSend: async () => {
			throw new Error("This session is no longer running");
		},
	});

	const input = field();
	fireEvent.input(input, { target: { value: "roda os testes" } });
	fireEvent.click(slot(composer(), "send"));

	await waitFor(() => expect(slot(composer(), "problem").textContent).toBe("This session is no longer running"));
	expect(input.value).toBe("roda os testes");
});

test("send stays out of reach until something is written", () => {
	renderConversation();

	expect(sendButton().disabled).toBe(true);
});

test("a working agent is offered a stop, and typing turns it back into a send", () => {
	renderConversation({ row: row({ activity: "working", trace: "Writing" }) });

	expect(composer().dataset.state).toBe("stop");

	fireEvent.input(field(), { target: { value: "mais uma coisa" } });

	expect(composer().dataset.state).toBe("send");
	expect(query("mobile-composer")?.textContent).not.toContain("Stop");
});

test("stopping interrupts the turn with the escape byte", async () => {
	const pressed: TerminalKey[] = [];
	renderConversation({ row: row({ activity: "working" }), onKey: async (key) => void pressed.push(key) });

	fireEvent.click(slot(composer(), "stop"));

	await waitFor(() => expect(pressed).toEqual(["escape"]));
});

test("a shell whose agent ended sends the user back to the desktop", () => {
	renderConversation({ row: row({ harness: undefined }) });

	expect(composer().dataset.state).toBe("ended");
	expect(composer().textContent).toContain("Agent ended — resume from the desktop");
});

test("a session that left the list says so instead of a bare screen", () => {
	renderConversation({ row: undefined });

	expect(slot(get("mobile-conversation"), "empty").textContent).toContain("This session is no longer open");
});
