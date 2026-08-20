import "./register-dom";
import { type FavoritesTransport, setFavoritesTransport } from "./orpc-transport";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SessionPageState } from "@shared/session-page";
import { SessionPagePanel } from "@renderer/routes/-features/session-page/session-page-panel";
import { SessionPageRegistry } from "@renderer/routes/-features/session-page/session-page-registry";
import { get, querySlot, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

class TestResizeObserver implements ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}

globalThis.ResizeObserver = TestResizeObserver;

function dataTransfer() {
	const stored = new Map<string, string>();

	return {
		effectAllowed: "none",
		dropEffect: "none",
		setData: (format: string, value: string) => stored.set(format, value),
		getData: (format: string) => stored.get(format) ?? "",
	};
}

let transport: FavoritesTransport;

function renderPanel(registry: ReturnType<typeof SessionPageRegistry.create>) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

	render(
		<QueryClientProvider client={queryClient}>
			<SessionPagePanel
				registry={registry}
				shellId="shell-1"
				obscured={false}
				coverable={false}
				expanded={false}
				onToggleExpanded={() => {}}
				onRestoreTerminalFocus={() => {}}
			/>
		</QueryClientProvider>,
	);
}

function blankRegistry() {
	const registry = SessionPageRegistry.create();
	registry.blank("shell-1");

	return registry;
}

async function blankPanel() {
	const registry = blankRegistry();
	renderPanel(registry);
	await waitFor(() => expect(get("session-page-favorites")).not.toBeNull());

	return registry;
}

const PREVIEW = "data:image/jpeg;base64,AAAA";

function rows() {
	return [...document.querySelectorAll<HTMLElement>('[data-component="session-page-favorite"]')];
}

function row(id: string) {
	return get("session-page-favorite", { favorite: id });
}

function titles() {
	return rows().map((element) => slot(element, "title").textContent);
}

function shortcuts() {
	return rows().map((element) => slot(element, "shortcut").textContent);
}

beforeEach(() => {
	transport = {
		favorites: [
			{ id: "f1", title: "Docs", url: "https://docs.example.com/" },
			{ id: "f2", title: "Status", url: "https://status.example.com/" },
			{ id: "f3", title: "Board", url: "https://board.example.com/guide" },
		],
	};
	setFavoritesTransport(transport);
});

afterEach(() => {
	cleanup();
	setFavoritesTransport({ favorites: [] });
	delete window.bankaiSessionPage;
});

test("the blank page numbers every favorite and opens the one that is clicked", async () => {
	const registry = await blankPanel();

	expect(shortcuts()).toEqual(["Ctrl+1", "Ctrl+2", "Ctrl+3"]);
	expect(slot(row("f3"), "host").textContent).toBe("board.example.com");

	fireEvent.click(slot(row("f2"), "open"));

	expect(registry.get("shell-1")?.url).toBe("https://status.example.com/");
});

test("a card shows the page picture the favorite was saved with and names its host without one", async () => {
	transport.favorites = [
		{ id: "f1", title: "Docs", url: "https://docs.example.com/", preview: PREVIEW },
		{ id: "f2", title: "Status", url: "https://status.example.com/" },
	];

	await blankPanel();

	expect(slot(row("f1"), "preview").querySelector("img")?.getAttribute("src")).toBe(PREVIEW);
	expect(slot(row("f2"), "preview").querySelector("img")).toBeNull();
	expect(slot(row("f2"), "fallback").textContent).toBe("status.example.com");
});

test("only the first nine favorites carry a shortcut box", async () => {
	transport.favorites = Array.from({ length: 10 }, (_, index) => ({
		id: `f${index + 1}`,
		title: `Site ${index + 1}`,
		url: `https://site${index + 1}.example.com/`,
	}));

	await blankPanel();

	expect(shortcuts().at(-1)).toBe("");
	expect(slot(row("f10"), "shortcut").className).not.toContain("border-outline");
	expect(slot(row("f9"), "shortcut").className).toContain("border-outline");
});

test("Ctrl with a digit opens that favorite while the address bar holds focus", async () => {
	const registry = await blankPanel();
	const address = get<HTMLInputElement>("session-page-address");

	fireEvent.keyDown(address, { key: "3", code: "Digit3", ctrlKey: true });

	expect(registry.get("shell-1")?.url).toBe("https://board.example.com/guide");
});

test("Alt with a digit is left alone for the row jump shortcut", async () => {
	const registry = await blankPanel();

	fireEvent.keyDown(get<HTMLInputElement>("session-page-address"), { key: "1", code: "Digit1", altKey: true });

	expect(registry.get("shell-1")?.url).toBeUndefined();
});

test("the remove control drops the favorite it sits on", async () => {
	await blankPanel();

	fireEvent.click(slot(row("f2"), "remove"));

	await waitFor(() => expect(rows()).toHaveLength(2));
	expect(transport.favorites.map((favorite) => favorite.title)).toEqual(["Docs", "Board"]);
});

test("a double click renames the favorite in place and Escape keeps the old name", async () => {
	await blankPanel();

	fireEvent.doubleClick(row("f1"));
	fireEvent.input(slot(row("f1"), "rename"), { target: { value: "Handbook" } });
	fireEvent.keyDown(slot(row("f1"), "rename"), { key: "Escape" });

	expect(slot(row("f1"), "title").textContent).toBe("Docs");

	fireEvent.doubleClick(row("f1"));
	fireEvent.input(slot(row("f1"), "rename"), { target: { value: "Handbook" } });
	fireEvent.keyDown(slot(row("f1"), "rename"), { key: "Enter" });

	await waitFor(() => expect(slot(row("f1"), "title").textContent).toBe("Handbook"));
	expect(transport.favorites.map((favorite) => favorite.title)).toEqual(["Handbook", "Status", "Board"]);
});

test("a drag that ends without a drop puts the list back the way the server has it", async () => {
	const registry = await blankPanel();
	const transfer = dataTransfer();

	fireEvent.dragStart(row("f3"), { dataTransfer: transfer });
	fireEvent.dragOver(row("f1"), { dataTransfer: transfer });

	expect(titles()).toEqual(["Board", "Docs", "Status"]);

	fireEvent.dragEnd(row("f3"));

	expect(titles()).toEqual(["Docs", "Status", "Board"]);
	expect(transport.favorites.map((favorite) => favorite.title)).toEqual(["Docs", "Status", "Board"]);

	fireEvent.keyDown(get<HTMLInputElement>("session-page-address"), { key: "1", code: "Digit1", ctrlKey: true });

	expect(registry.get("shell-1")?.url).toBe("https://docs.example.com/");
});

test("dragging a favorite renumbers the list while it moves and saves the order it lands on", async () => {
	const registry = await blankPanel();
	const moved = row("f3");
	const transfer = dataTransfer();

	fireEvent.dragStart(moved, { dataTransfer: transfer });
	fireEvent.dragOver(row("f1"), { dataTransfer: transfer });

	expect(titles()).toEqual(["Board", "Docs", "Status"]);
	expect(slot(row("f3"), "shortcut").textContent).toBe("Ctrl+1");

	fireEvent.drop(row("f3"), { dataTransfer: transfer });
	fireEvent.dragEnd(row("f3"));

	await waitFor(() => expect(transport.favorites.map((favorite) => favorite.title)).toEqual([
		"Board",
		"Docs",
		"Status",
	]));
	expect(titles()).toEqual(["Board", "Docs", "Status"]);

	fireEvent.keyDown(get<HTMLInputElement>("session-page-address"), { key: "1", code: "Digit1", ctrlKey: true });

	expect(registry.get("shell-1")?.url).toBe("https://board.example.com/guide");
});

test("a reorder the server rejects snaps the list back to the saved order", async () => {
	await blankPanel();
	const transfer = dataTransfer();
	transport.saveFailure = "favorites are locked";

	fireEvent.dragStart(row("f3"), { dataTransfer: transfer });
	fireEvent.dragOver(row("f1"), { dataTransfer: transfer });
	fireEvent.drop(row("f3"), { dataTransfer: transfer });
	fireEvent.dragEnd(row("f3"));

	await waitFor(() => expect(querySlot(get("session-page-favorites"), "failure")).not.toBeNull());
	expect(slot(get("session-page-favorites"), "failure").textContent).toBeTruthy();
	expect(titles()).toEqual(["Docs", "Status", "Board"]);
});

test("a list that cannot be read shows the failure with a retry", async () => {
	transport.listFailure = "favorites are unreadable";
	renderPanel(blankRegistry());

	await waitFor(() => expect(querySlot(get("session-page-favorites"), "failure")).not.toBeNull());
	expect(slot(get("session-page-favorites"), "failure").textContent).toBeTruthy();
	expect(slot(get("session-page-favorites"), "retry").textContent).toBe("RETRY");

	transport.listFailure = undefined;
	fireEvent.click(slot(get("session-page-favorites"), "retry"));

	await waitFor(() => expect(titles()).toEqual(["Docs", "Status", "Board"]));
});

test("a save that fails reports itself without offering a retry", async () => {
	await blankPanel();
	transport.saveFailure = "favorites are locked";

	fireEvent.click(slot(row("f2"), "remove"));

	await waitFor(() => expect(querySlot(get("session-page-favorites"), "failure")).not.toBeNull());
	expect(slot(get("session-page-favorites"), "failure").textContent).toBeTruthy();
	expect(querySlot(get("session-page-favorites"), "retry")).toBeNull();
	expect(titles()).toEqual(["Docs", "Status", "Board"]);
});

test("the star saves the open page and takes it back off the list", async () => {
	window.bankaiSessionPage = {
		present: async () => {},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		preview: async () => PREVIEW,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	transport.favorites = [];
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "https://handbook.example.com/start");
	const state: SessionPageState = {
		shellId: "shell-1",
		url: "https://handbook.example.com/start",
		title: "Handbook",
		canGoBack: false,
		canGoForward: false,
		loading: false,
		failure: null,
	};
	registry.update(state);
	renderPanel(registry);
	const star = () => slot(get("session-page-panel"), "favorite");

	await waitFor(() => expect(star().getAttribute("aria-label")).toBe("Save page to favorites"));

	fireEvent.click(star());

	await waitFor(() => expect(star().getAttribute("aria-label")).toBe("Remove page from favorites"));
	expect(transport.favorites).toEqual([
		{ id: "f1", title: "Handbook", url: "https://handbook.example.com/start", preview: PREVIEW },
	]);

	fireEvent.click(star());

	await waitFor(() => expect(star().getAttribute("aria-label")).toBe("Save page to favorites"));
	expect(transport.favorites).toEqual([]);
});
