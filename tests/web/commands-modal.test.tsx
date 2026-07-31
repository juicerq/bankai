import { type CommandsTransport, setCommandsTransport } from "./orpc-transport";
import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@main/store/projects";
import { CommandsModal } from "@renderer/routes/-components/commands-modal";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

const PROJECTS: Project[] = [
	{ id: "p1", name: "bankai", path: "/home/jui/projects/bankai", createdAt: 0 },
	{ id: "p2", name: "atlas", path: "/home/jui/projects/atlas", createdAt: 1 },
];

const onRun = jest.fn();
const onClose = jest.fn();
let transport: CommandsTransport;

function renderModal() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

	render(
		<QueryClientProvider client={queryClient}>
			<CommandsModal projects={PROJECTS} onRun={onRun} onClose={onClose} />
		</QueryClientProvider>,
	);
}

async function listedModal() {
	renderModal();
	await waitFor(() => {
		expect(query("command-row", { commandId: "c1" })).not.toBeNull();
	});

	return get("commands-modal");
}

function row(id: string) {
	return get("command-row", { commandId: id });
}

function scope(id: string) {
	return get("command-scope", { scopeId: id });
}

function type(input: HTMLElement, value: string) {
	input.focus();
	fireEvent.input(input, { target: { value } });
}

beforeEach(() => {
	onRun.mockClear();
	onClose.mockClear();
	transport = {
		commands: [
			{ id: "c1", projectId: "p1", label: "Dev server", command: "bun run dev", createdAt: 0 },
			{ id: "c2", projectId: "p1", label: "Tests", command: "bun test", createdAt: 0 },
			{ id: "c3", projectId: "p2", label: "Package", command: "make package", createdAt: 0 },
		],
	};
	setCommandsTransport(transport);
});

afterEach(cleanup);

test("opens in all projects and lists every project command with its owner", async () => {
	const modal = await listedModal();

	expect(modal.dataset.scope).toBe("all");
	expect(row("c1").dataset.projectName).toBe("bankai");
	expect(row("c3").dataset.projectName).toBe("atlas");
	expect(scope("all").dataset.count).toBe("3");
	expect(scope("p1").dataset.count).toBe("2");
	expect(scope("p2").dataset.count).toBe("1");
});

test("selecting a project narrows commands and removes repeated ownership", async () => {
	const modal = await listedModal();

	fireEvent.click(scope("p2"));

	expect(modal.dataset.scope).toBe("p2");
	expect(query("command-row", { commandId: "c1" })).toBeNull();
	expect(row("c3").dataset.projectName).toBeUndefined();
});

test("search matches label, command line, and project name inside the scope", async () => {
	const modal = await listedModal();
	const input = slot(modal, "filter-input");

	type(input, "run dev");
	expect(query("command-row", { commandId: "c1" })).not.toBeNull();
	expect(query("command-row", { commandId: "c2" })).toBeNull();

	type(input, "atlas");
	expect(query("command-row", { commandId: "c3" })).not.toBeNull();

	fireEvent.click(scope("p1"));
	expect(query("command-row", { commandId: "c3" })).toBeNull();
});

test("running from all projects dispatches the command stored project and closes", async () => {
	await listedModal();

	fireEvent.click(slot(row("c3"), "run-command"));

	expect(onClose).toHaveBeenCalled();
	expect(onRun).toHaveBeenCalledWith("p2", expect.objectContaining({ label: "Package", command: "make package" }));
});

test("keyboard changes project scope separately from result navigation", async () => {
	const modal = await listedModal();
	const input = slot(modal, "filter-input");

	fireEvent.keyDown(input, { key: "ArrowRight", ctrlKey: true });
	expect(modal.dataset.scope).toBe("p1");

	fireEvent.keyDown(input, { key: "ArrowDown" });
	fireEvent.keyDown(input, { key: "Enter" });

	expect(onRun).toHaveBeenCalledWith("p1", expect.objectContaining({ label: "Tests" }));
});

test("a project-scoped new command inherits the visible project", async () => {
	const modal = await listedModal();
	fireEvent.click(scope("p2"));
	fireEvent.click(slot(modal, "new-command"));

	const editor = get("command-editor");
	expect(editor.dataset.projectId).toBe("p2");
	type(slot(editor, "command-label"), "Gate");
	type(slot(editor, "command-line"), "bun run check");
	fireEvent.click(slot(editor, "save-command"));

	await waitFor(() => {
		expect(transport.commands.some((command) => command.projectId === "p2" && command.command === "bun run check")).toBe(true);
	});
});

test("a global new command requires an explicit project", async () => {
	const modal = await listedModal();
	fireEvent.click(slot(modal, "new-command"));

	const editor = get("command-editor");
	type(slot(editor, "command-label"), "Gate");
	type(slot(editor, "command-line"), "bun run check");
	const save = slot<HTMLButtonElement>(editor, "save-command");
	expect(save.disabled).toBe(true);

	fireEvent.change(slot(editor, "project-select"), { target: { value: "p2" } });
	expect(save.disabled).toBe(false);
	fireEvent.click(save);

	await waitFor(() => {
		expect(transport.commands.some((command) => command.projectId === "p2" && command.command === "bun run check")).toBe(true);
	});
});

test("editing changes the command without moving its project", async () => {
	await listedModal();
	fireEvent.click(slot(row("c3"), "edit-command"));

	const editor = get("command-editor", { commandId: "c3" });
	expect(editor.dataset.projectId).toBe("p2");
	type(slot(editor, "command-line"), "bun test --coverage");
	fireEvent.click(slot(editor, "save-command"));

	await waitFor(() => {
		expect(transport.commands.find((command) => command.id === "c3")).toEqual(
			expect.objectContaining({ projectId: "p2", command: "bun test --coverage" }),
		);
	});
});

test("deleting a command removes it from its project and global counts", async () => {
	await listedModal();
	fireEvent.click(slot(row("c1"), "delete-command"));

	await waitFor(() => {
		expect(query("command-row", { commandId: "c1" })).toBeNull();
	});
	expect(scope("all").dataset.count).toBe("2");
	expect(scope("p1").dataset.count).toBe("1");
});

test("shows scoped empty and failed loading states", async () => {
	transport.commands = [];
	const modal = await listedModalWithoutRows();
	expect(slot(modal, "empty")).toBeDefined();

	cleanup();
	transport.listFailure = "commands.json cannot be read";
	renderModal();
	await waitFor(() => {
		expect(slot(get("commands-modal"), "load-error")).toBeDefined();
	});
});

test("a rejected save keeps the palette open and reports the failure", async () => {
	const modal = await listedModal();
	transport.saveFailure = "commands.json is read-only";
	fireEvent.click(scope("p1"));
	fireEvent.click(slot(modal, "new-command"));

	const editor = get("command-editor");
	type(slot(editor, "command-label"), "Gate");
	type(slot(editor, "command-line"), "bun run check");
	fireEvent.click(slot(editor, "save-command"));

	await waitFor(() => {
		expect(slot(get("commands-modal"), "save-error")).toBeDefined();
	});
});

test("Escape closes the palette", async () => {
	const modal = await listedModal();

	fireEvent.keyDown(slot(modal, "filter-input"), { key: "Escape" });

	expect(onClose).toHaveBeenCalled();
});

async function listedModalWithoutRows() {
	renderModal();
	await waitFor(() => {
		expect(slot(get("commands-modal"), "empty")).toBeDefined();
	});

	return get("commands-modal");
}
