import {
	type CommandsTransport,
	type ServicesTransport,
	setCommandsTransport,
	setServicesTransport,
} from "./orpc-transport";
import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@shared/projects";
import { CommandsModal } from "@renderer/routes/-features/commands/commands-modal";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render, waitFor } from "./testing-library";

const PROJECTS: Project[] = [
	{ id: "p1", name: "bankai", path: "/home/jui/projects/bankai", createdAt: 0 },
	{ id: "p2", name: "atlas", path: "/home/jui/projects/atlas", createdAt: 1 },
];

const onRun = jest.fn();
const onClose = jest.fn();
let transport: CommandsTransport;
let services: ServicesTransport;

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

function chooseProject(name: string) {
	fireEvent.click(get("project-select"));
	const option = [...get("project-select-menu").querySelectorAll("button")]
		.find((button) => button.textContent?.startsWith(name));

	if (!option) {
		throw new Error(`No project option named ${name}`);
	}

	fireEvent.click(option);
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
			{ id: "c1", projectId: "p1", label: "Dev server", command: "bun run dev", kind: "service", createdAt: 0 },
			{ id: "c2", projectId: "p1", label: "Tests", command: "bun test", kind: "task", createdAt: 0 },
			{ id: "c3", projectId: "p2", label: "Package", command: "make package", kind: "task", createdAt: 0 },
		],
	};
	services = { states: [], calls: [] };
	setCommandsTransport(transport);
	setServicesTransport(services);
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

test("running from all projects dispatches the command stored project and closes", async () => {
	await listedModal();

	fireEvent.click(slot(row("c3"), "run-command"));

	expect(onClose).toHaveBeenCalled();
	expect(onRun).toHaveBeenCalledWith("p2", expect.objectContaining({ label: "Package", command: "make package" }));
});

test("keyboard changes project scope separately from result navigation", async () => {
	const modal = await listedModal();

	fireEvent.keyDown(modal, { key: "ArrowRight", ctrlKey: true });
	expect(modal.dataset.scope).toBe("p1");

	fireEvent.keyDown(modal, { key: "Enter" });

	expect(onRun).toHaveBeenCalledWith("p1", expect.objectContaining({ label: "Tests" }));
	expect(onClose).toHaveBeenCalled();
});

test("lists tasks and services in separate groups", async () => {
	await listedModal();

	expect(query("command-group", { group: "TASKS" })).not.toBeNull();
	expect(query("command-group", { group: "SERVICES" })).not.toBeNull();
	expect(row("c1").dataset.status).toBe("stopped");
	expect(row("c2").dataset.status).toBeUndefined();
});

test("Enter on a service toggles it and keeps the palette open", async () => {
	const modal = await listedModal();

	fireEvent.keyDown(modal, { key: "ArrowRight", ctrlKey: true });
	fireEvent.keyDown(modal, { key: "ArrowDown" });
	fireEvent.keyDown(modal, { key: "Enter" });

	expect(onRun).toHaveBeenCalledWith("p1", expect.objectContaining({ label: "Dev server", kind: "service" }));
	expect(onClose).not.toHaveBeenCalled();
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

test("choosing a project while creating moves the new command to it", async () => {
	const modal = await listedModal();
	fireEvent.click(slot(modal, "new-command"));

	const editor = get("command-editor");
	expect(editor.dataset.projectId).toBeUndefined();

	fireEvent.click(scope("p2"));
	expect(get("command-editor").dataset.projectId).toBe("p2");
});

test("a global new command requires an explicit project", async () => {
	const modal = await listedModal();
	fireEvent.click(slot(modal, "new-command"));

	const editor = get("command-editor");
	type(slot(editor, "command-label"), "Gate");
	type(slot(editor, "command-line"), "bun run check");
	const save = slot<HTMLButtonElement>(editor, "save-command");
	expect(save.disabled).toBe(true);

	chooseProject("atlas");
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
	await act(async () => {
		await Bun.sleep(0);
		await Bun.sleep(0);
	});

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

	fireEvent.keyDown(modal, { key: "Escape" });

	expect(onClose).toHaveBeenCalled();
});

test("leaving the editor gives the palette its keyboard back", async () => {
	const modal = await listedModal();
	fireEvent.click(slot(modal, "new-command"));

	fireEvent.keyDown(get("command-editor"), { key: "Escape" });

	expect(document.activeElement).toBe(modal);
	fireEvent.keyDown(document.activeElement ?? modal, { key: "Escape" });
	expect(onClose).toHaveBeenCalled();
});

async function listedModalWithoutRows() {
	renderModal();
	await waitFor(() => {
		expect(slot(get("commands-modal"), "empty")).toBeDefined();
	});

	return get("commands-modal");
}
