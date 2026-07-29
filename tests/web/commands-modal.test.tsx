import { type CommandsTransport, setCommandsTransport } from "./orpc-transport";
import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@main/store/projects";
import { CommandsModal } from "@renderer/routes/-components/commands-modal";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

const PROJECT: Project = { id: "p1", name: "bankai", path: "/home/jui/projects/bankai", createdAt: 0 };

const onRun = jest.fn();
const onClose = jest.fn();
let transport: CommandsTransport;

function renderModal() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

	render(
		<QueryClientProvider client={queryClient}>
			<CommandsModal project={PROJECT} onRun={onRun} onClose={onClose} />
		</QueryClientProvider>,
	);
}

async function listedModal() {
	renderModal();
	await waitFor(() => {
		expect(get("commands-modal").textContent).not.toContain("Reading commands");
	});

	return get("commands-modal");
}

function row(id: string) {
	return get("command-row", { id });
}

function action(label: string) {
	const button = get("commands-modal").querySelector<HTMLElement>(`[aria-label="${label}"]`);
	if (!button) {
		throw new Error(`No ${label} action`);
	}

	return button;
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
			{ id: "c3", projectId: "p2", label: "Elsewhere", command: "make", createdAt: 0 },
		],
	};
	setCommandsTransport(transport);
});

afterEach(cleanup);

test("lists only the commands of the project it was opened for", async () => {
	const modal = await listedModal();

	expect(modal.textContent).toContain("Dev server");
	expect(modal.textContent).toContain("bun run dev");
	expect(modal.textContent).not.toContain("Elsewhere");
	expect(modal.textContent).toContain("RUN IN bankai");
});

test("clicking a command hands it to the workspace and closes", async () => {
	await listedModal();

	fireEvent.click(slot(row("c2"), "run-command"));

	expect(onClose).toHaveBeenCalled();
	expect(onRun).toHaveBeenCalledWith("p1", expect.objectContaining({ label: "Tests", command: "bun test" }));
});

test("Enter runs the highlighted command after the arrows move it", async () => {
	const modal = await listedModal();
	const filter = slot(modal, "filter-input");

	fireEvent.keyDown(filter, { key: "ArrowDown" });
	fireEvent.keyDown(filter, { key: "Enter" });

	expect(onRun).toHaveBeenCalledWith("p1", expect.objectContaining({ label: "Tests" }));
});

test("the filter reads the command line as well as the name", async () => {
	const modal = await listedModal();

	type(slot(modal, "filter-input"), "run dev");

	expect(query("command-row", { id: "c1" })).not.toBeNull();
	expect(query("command-row", { id: "c2" })).toBeNull();
});

test("a saved new command joins the list", async () => {
	const modal = await listedModal();

	fireEvent.click(slot(modal, "new-command"));
	const editor = get("command-editor");
	type(slot(editor, "command-label"), "Gate");
	type(slot(editor, "command-line"), "bun run check");
	fireEvent.click(slot(editor, "save-command"));

	await waitFor(() => {
		expect(get("commands-modal").textContent).toContain("bun run check");
	});
	expect(transport.commands.map((command) => command.command)).toContain("bun run check");
});

test("an incomplete draft cannot be saved", async () => {
	const modal = await listedModal();

	fireEvent.click(slot(modal, "new-command"));
	const editor = get("command-editor");
	type(slot(editor, "command-label"), "Gate");

	const save = slot<HTMLButtonElement>(editor, "save-command");
	expect(save.disabled).toBe(true);
});

test("editing a command rewrites it in place", async () => {
	await listedModal();

	fireEvent.click(action("Edit Tests"));
	const editor = get("command-editor", { id: "c2" });
	const line = slot<HTMLInputElement>(editor, "command-line");
	expect(line.value).toBe("bun test");

	type(slot(editor, "command-line"), "bun test --coverage");
	fireEvent.click(slot(editor, "save-command"));

	await waitFor(() => {
		expect(get("commands-modal").textContent).toContain("bun test --coverage");
	});
	expect(transport.commands).toHaveLength(3);
});

test("deleting a command drops it from the list", async () => {
	await listedModal();

	fireEvent.click(action("Delete Dev server"));

	await waitFor(() => {
		expect(query("command-row", { id: "c1" })).toBeNull();
	});
});

test("a rejected save says the change was not applied", async () => {
	const modal = await listedModal();
	transport.saveFailure = "commands.json is read-only";

	fireEvent.click(slot(modal, "new-command"));
	const editor = get("command-editor");
	type(slot(editor, "command-label"), "Gate");
	type(slot(editor, "command-line"), "bun run check");
	fireEvent.click(slot(editor, "save-command"));

	await waitFor(() => {
		expect(slot(get("commands-modal"), "save-error").textContent).toContain("was not applied");
	});
});

test("Escape closes the palette", async () => {
	const modal = await listedModal();

	fireEvent.keyDown(slot(modal, "filter-input"), { key: "Escape" });

	expect(onClose).toHaveBeenCalled();
});
