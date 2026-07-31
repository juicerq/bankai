import { afterEach, expect, test } from "bun:test";
import type { TerminalKey } from "@main/terminal/input";
import { ACTIVITY_LABEL } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { AGENT_START_MS } from "@renderer/routes/mobile/-components/mobile-composer";
import { MobileConversation } from "@renderer/routes/mobile/-components/mobile-conversation";
import type { ConversationView } from "@renderer/routes/mobile/-utils/use-conversation";
import type { ConversationBlock } from "@shared/conversation";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render, waitFor } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;

const watchers = new Set<() => void>();

class WatchedBox {
	constructor(private readonly resized: () => void) {}

	observe() {
		watchers.add(this.resized);
	}

	disconnect() {
		watchers.delete(this.resized);
	}

	unobserve() {
		watchers.delete(this.resized);
	}
}

Object.assign(globalThis, { ResizeObserver: WatchedBox });

afterEach(() => watchers.clear());

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
		since: undefined,
		attention: undefined,
		...patch,
	};
}

function view(blocks: ConversationBlock[], patch: Partial<ConversationView> = {}): ConversationView {
	return {
		blocks,
		title: undefined,
		atStart: false,
		loading: false,
		loadingOlder: false,
		loadOlder: async () => {},
		...patch,
	};
}

interface ConversationOptions {
	row?: SessionRow | undefined;
	agent?: string;
	conversation?: ConversationView;
	onSend?: (text: string) => Promise<void>;
	onKey?: (key: TerminalKey) => Promise<void>;
	onOpenAgent?: (toolUseId: string) => void;
	onBack?: () => void;
}

function element(options: ConversationOptions) {
	const session = "row" in options && !options.row ? undefined : {
		row: options.row ?? row(),
		onSend: options.onSend ?? (async () => {}),
		onKey: options.onKey ?? (async () => {}),
	};

	return (
		<MobileConversation
			shellId="s1"
			session={session}
			agent={options.agent}
			conversation={options.conversation ?? view([])}
			onOpenAgent={options.onOpenAgent}
			onBack={options.onBack ?? (() => {})}
		/>
	);
}

function renderConversation(options: ConversationOptions = {}) {
	return render(element(options));
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

function scroller({ scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
	const element = slot(get("mobile-conversation"), "scroll");

	Object.defineProperty(element, "scrollHeight", { value: scrollHeight, configurable: true });
	Object.defineProperty(element, "clientHeight", { value: clientHeight, configurable: true });

	return element;
}

function grow() {
	act(() => {
		for (const resized of watchers) {
			resized();
		}
	});
}

test("the conversation paints its blocks in the order the file wrote them", () => {
	renderConversation({
		conversation: view([
			{ kind: "user", id: "u1", text: "adiciona retry" },
			{ kind: "tool", id: "t1", name: "Read", state: "done" },
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
			{ kind: "tool", id: "t1", name: "Bash", state: "running" },
			{ kind: "tool", id: "t2", name: "Edit", state: "failed" },
		]),
	});

	expect(slot(block(0), "tool-dot").className).toContain("pending-pulse");
	expect(slot(block(1), "tool-dot").className).toContain("bg-removed");
	expect(block(1).className).toContain("text-removed");
});

test("consecutive steps hang off one rail, and a message breaks it into two", () => {
	renderConversation({
		conversation: view([
			{ kind: "tool", id: "t1", name: "Read", state: "done" },
			{ kind: "tool", id: "t2", name: "Edit", state: "done" },
			{ kind: "agent", id: "m1", text: "Pronto." },
			{ kind: "tool", id: "t3", name: "Bash", state: "running" },
		]),
	});
	const rails = [...document.querySelectorAll<HTMLElement>('[data-component="tool-timeline"]')];

	expect(rails).toHaveLength(2);
	expect(rails[0]?.querySelectorAll('[data-component="conversation-block"]')).toHaveLength(2);
	expect(blocks().map((block) => block.dataset.kind)).toEqual(["tool", "tool", "agent", "tool"]);
});

test("an edit says how many lines it moved, beside the tool that moved them", () => {
	renderConversation({
		conversation: view([
			{ kind: "tool", id: "t1", name: "Edit", state: "done", edit: { added: 12, removed: 3 } },
		]),
	});

	expect(slot(block(0), "edit").textContent).toContain("+12");
	expect(slot(block(0), "edit").textContent).toContain("3");
	expect(block(0).textContent).toContain("Edit");
});

test("the reasoning arrives folded and opens where it sits", () => {
	renderConversation({
		conversation: view([{ kind: "thinking", id: "th1", text: "o upload não tem retry\nnem backoff" }]),
	});

	expect(block(0).dataset.kind).toBe("thinking");
	expect(slot(block(0), "thinking-text").className).toContain("line-clamp-1");

	fireEvent.click(block(0));

	expect(slot(block(0), "thinking-text").className).not.toContain("line-clamp-1");
	expect(slot(block(0), "thinking-text").textContent).toContain("nem backoff");
});

test("a call that spawned a subagent opens it, while an ordinary tool stays put", () => {
	const opened: string[] = [];
	renderConversation({
		conversation: view([
			{ kind: "tool", id: "t1", name: "Read", state: "done" },
			{ kind: "tool", id: "toolu_a", name: "Agent", state: "running", agent: true },
		]),
		onOpenAgent: (toolUseId) => opened.push(toolUseId),
	});

	expect(block(0).tagName).toBe("DIV");
	expect(block(1).tagName).toBe("BUTTON");

	fireEvent.click(block(1));

	expect(opened).toEqual(["toolu_a"]);
});

test("a subagent with nothing on disk says so instead of pretending to be a session", () => {
	renderConversation({ agent: "Subagent", row: undefined });

	expect(slot(get("mobile-conversation"), "title").textContent).toBe("Subagent");
	expect(slot(get("mobile-conversation"), "empty").textContent).toContain("left no transcript");
	expect(query("mobile-composer")).toBeNull();
});

test("a compaction and an interruption read as markers, not as messages", () => {
	renderConversation({
		conversation: view([{ kind: "compacted", id: "c1" }, { kind: "interrupted", id: "i1" }]),
	});

	expect(block(0).textContent).toContain("CONVERSATION COMPACTED");
	expect(block(1).textContent).toContain("INTERRUPTED");
});

test("the first byte of the file says so above the oldest block", () => {
	renderConversation({ conversation: view([{ kind: "user", id: "u1", text: "oi" }], { atStart: true }) });

	expect(slot(get("mobile-conversation"), "start").textContent).toContain("BEGINNING OF THIS CONVERSATION");
});

test("reading near the top asks for the step above, once", () => {
	let pulls = 0;
	renderConversation({
		conversation: view([{ kind: "agent", id: "m1", text: "O upload" }], { loadOlder: async () => void pulls++ }),
	});
	const element = scroller({ scrollHeight: 5000, clientHeight: 200 });

	element.scrollTop = 3000;
	fireEvent.scroll(element);

	expect(pulls).toBe(0);

	element.scrollTop = 150;
	fireEvent.scroll(element);

	expect(pulls).toBe(1);
});

test("a step already in flight is not asked for again, and neither is the start of the file", () => {
	let pulls = 0;
	const loadOlder = async () => void pulls++;
	const rendered = renderConversation({
		conversation: view([{ kind: "agent", id: "m1", text: "O upload" }], { loadingOlder: true, loadOlder }),
	});
	const scrollArea = scroller({ scrollHeight: 5000, clientHeight: 200 });

	scrollArea.scrollTop = 0;
	fireEvent.scroll(scrollArea);

	rendered.rerender(
		element({ conversation: view([{ kind: "agent", id: "m1", text: "O upload" }], { atStart: true, loadOlder }) }),
	);
	fireEvent.scroll(scrollArea);

	expect(pulls).toBe(0);
});

test("history landing above the reader keeps the block they were reading in place", () => {
	renderConversation({ conversation: view([{ kind: "agent", id: "m1", text: "O upload" }]) });
	const element = scroller({ scrollHeight: 500, clientHeight: 200 });

	element.scrollTop = 10;
	fireEvent.scroll(element);
	Object.defineProperty(element, "scrollHeight", { value: 900, configurable: true });
	grow();

	expect(element.scrollTop).toBe(410);
});

test("the parsed title wins over the session name, and the state stays visible", () => {
	renderConversation({
		row: row({ activity: "working", since: Date.now() - 74_000 }),
		conversation: view([], { title: "Retry no upload de fotos" }),
	});

	expect(slot(get("mobile-conversation"), "title").textContent).toBe("Retry no upload de fotos");
	expect(slot(get("mobile-conversation"), "activity").textContent).toContain(ACTIVITY_LABEL.working);
	expect(slot(get("mobile-conversation"), "session-elapsed").textContent).toContain("1m");
});

test("the back chevron returns to the list", () => {
	let backs = 0;
	renderConversation({ onBack: () => backs++ });

	fireEvent.click(slot(get("mobile-conversation"), "back"));

	expect(backs).toBe(1);
});

test("a block that grows in place keeps the newest line in view", () => {
	renderConversation({ conversation: view([{ kind: "agent", id: "m1", text: "O upload" }]) });
	const element = scroller({ scrollHeight: 500, clientHeight: 200 });

	grow();

	expect(element.scrollTop).toBe(300);
});

test("a reader who scrolled up is left where they were", () => {
	renderConversation({ conversation: view([{ kind: "agent", id: "m1", text: "O upload" }]) });
	const element = scroller({ scrollHeight: 500, clientHeight: 200 });

	element.scrollTop = 0;
	fireEvent.scroll(element);
	grow();

	expect(element.scrollTop).toBe(0);
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

test("a working agent keeps its stop within reach even once the next prompt is written", () => {
	renderConversation({ row: row({ activity: "working" }) });

	expect(composer().dataset.state).toBe("working");
	expect(slot(composer(), "stop")).toBeDefined();

	fireEvent.input(field(), { target: { value: "mais uma coisa" } });

	expect(slot(composer(), "stop")).toBeDefined();
	expect(sendButton().disabled).toBe(false);
});

test("an idle agent has no turn to stop", () => {
	renderConversation();

	expect(composer().dataset.state).toBe("idle");
	expect(composer().textContent).not.toContain("Stop");
});

test("stopping interrupts the turn with the escape byte", async () => {
	const pressed: TerminalKey[] = [];
	renderConversation({ row: row({ activity: "working" }), onKey: async (key) => void pressed.push(key) });

	fireEvent.click(slot(composer(), "stop"));

	await waitFor(() => expect(pressed).toEqual(["escape"]));
});

test("a double tap on stop interrupts the turn once", async () => {
	const pressed: TerminalKey[] = [];
	let release = () => {};
	renderConversation({
		row: row({ activity: "working" }),
		onKey: async (key) => {
			pressed.push(key);
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		},
	});

	fireEvent.click(slot(composer(), "stop"));
	fireEvent.click(slot(composer(), "stop"));

	await waitFor(() => expect(pressed).toEqual(["escape"]));
	await act(async () => release());
});

test("a shell whose agent ended sends the user back to the desktop", () => {
	renderConversation({ row: row({ harness: undefined, createdAt: Date.now() - 2 * AGENT_START_MS }) });

	expect(composer().dataset.state).toBe("ended");
	expect(composer().textContent).toContain("Agent ended — resume from the desktop");
});

test("a session opened the moment it was created waits for the agent instead of burying it", () => {
	renderConversation({ row: row({ harness: undefined, createdAt: Date.now() }) });

	expect(composer().dataset.state).toBe("starting");
	expect(composer().textContent).toContain("Starting the agent");
});

test("a session that left the list says so once, with nothing left to type into", () => {
	renderConversation({ row: undefined });

	expect(slot(get("mobile-conversation"), "empty").textContent).toContain("This session is no longer open");
	expect(query("mobile-composer")).toBeNull();
});

test("a sent message is answered by the state instead of silence", () => {
	renderConversation({
		row: row({ activity: "working", since: NOW }),
		conversation: view([{ kind: "user", id: "u1", text: "adiciona retry" }]),
	});

	expect(slot(get("mobile-conversation"), "waiting").textContent).toContain(ACTIVITY_LABEL.working);
});

test("the wait ends the moment the agent puts something on the page", () => {
	renderConversation({
		row: row({ activity: "working" }),
		conversation: view([
			{ kind: "user", id: "u1", text: "adiciona retry" },
			{ kind: "tool", id: "t1", name: "Read", state: "running" },
		]),
	});

	expect(get("mobile-conversation").querySelector('[data-slot="waiting"]')).toBeNull();
});
