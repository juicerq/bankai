import { afterEach, expect, test } from "bun:test";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileConversation } from "@renderer/routes/mobile/-components/mobile-conversation";
import type { ConversationView } from "@renderer/routes/mobile/-utils/use-conversation";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;

const DESKTOP_ONLY = { label: "Codex" };

const NOTICE = "Conversas do Codex estão disponíveis apenas no desktop nesta versão.";

class WatchedBox {
	observe() {}
	disconnect() {}
	unobserve() {}
}

Object.assign(globalThis, { ResizeObserver: WatchedBox });

function row(patch: Partial<SessionRow> = {}): SessionRow {
	return {
		shellId: "s1",
		projectId: "p1",
		projectName: "bankai",
		title: "remover o debounce do resize",
		branch: "fix/debounce",
		harness: "codex",
		createdAt: NOW,
		lastTouchedAt: NOW,
		archivedAt: undefined,
		activity: undefined,
		since: undefined,
		attention: undefined,
		...patch,
	};
}

const CONVERSATION: ConversationView = {
	blocks: [{ kind: "user", id: "b1", text: "remover o debounce" }],
	title: undefined,
	atStart: false,
	loading: false,
	loadingOlder: false,
	loadOlder: async () => {},
};

function renderConversation(patch: Partial<SessionRow> = {}) {
	const session = row(patch);

	return render(
		<MobileConversation
			shellId={session.shellId}
			session={{ row: session, onSend: async () => {}, onKey: async () => {} }}
			conversation={CONVERSATION}
			desktopOnly={DESKTOP_ONLY}
			onBack={() => {}}
		/>,
	);
}

test("a codex session says its conversation lives on the desktop, in those exact words", () => {
	renderConversation();

	expect(slot(get("mobile-conversation"), "desktop-only").textContent).toBe(NOTICE);
});

test("the desktop-only surface mounts nothing the user could type or send into", () => {
	renderConversation({ activity: "working", since: NOW });

	expect(query("mobile-composer")).toBeNull();
	expect(query("mobile-attention")).toBeNull();
	expect(query("mobile-keypad")).toBeNull();
	expect(get("mobile-conversation").querySelector('[data-slot="reading"]')).toBeNull();
	expect(document.querySelectorAll('[data-component="conversation-block"]')).toHaveLength(0);
});

test("a codex session waiting for the user still offers no attention card", () => {
	renderConversation({ activity: "needs-attention", attention: { message: "Allow?", at: NOW } });

	expect(query("mobile-attention")).toBeNull();
	expect(slot(get("mobile-conversation"), "desktop-only").textContent).toBe(NOTICE);
});

test("the session stays open and its back button still returns to the list", () => {
	let left = false;
	const session = row();
	render(
		<MobileConversation
			shellId={session.shellId}
			session={{ row: session, onSend: async () => {}, onKey: async () => {} }}
			conversation={CONVERSATION}
			desktopOnly={DESKTOP_ONLY}
			onBack={() => {
				left = true;
			}}
		/>,
	);

	expect(slot(get("mobile-conversation"), "title").textContent).toBe("remover o debounce do resize");

	fireEvent.click(slot(get("mobile-conversation"), "back"));

	expect(left).toBe(true);
});

test("a claude session is left exactly as it was", () => {
	const session = row({ harness: "claude" });
	render(
		<MobileConversation
			shellId={session.shellId}
			session={{ row: session, onSend: async () => {}, onKey: async () => {} }}
			conversation={CONVERSATION}
			onBack={() => {}}
		/>,
	);

	expect(query("desktop-only")).toBeNull();
	expect(get("mobile-composer")).not.toBeNull();
	expect(document.querySelectorAll('[data-component="conversation-block"]').length).toBeGreaterThan(0);
});
