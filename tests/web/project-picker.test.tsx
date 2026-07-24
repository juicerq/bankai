import { setBrowseDirectories } from "./orpc-transport";
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectPicker } from "@renderer/routes/-components/project-picker";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

const directories: Record<string, string[]> = {
	"/home/jui": [".config", "downloads", "projects"],
	"/home/jui/projects": ["bankai", "dogama"],
	"/home": ["jui"],
	"/": ["home"],
};

const onAdd = jest.fn();
const onOpenSystemPicker = jest.fn();
const onClose = jest.fn();

function renderPicker(addError?: string) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

	return render(
		<QueryClientProvider client={queryClient}>
			<ProjectPicker
				adding={false}
				addError={addError}
				onAdd={onAdd}
				onOpenSystemPicker={onOpenSystemPicker}
				onClose={onClose}
			/>
		</QueryClientProvider>,
	);
}

async function openedAt(path: string) {
	await waitFor(() => {
		expect(get("project-picker").dataset.path).toBe(path);
		expect(query("project-picker-item", { name: ".." })).not.toBeNull();
	});

	return get("project-picker");
}

function typePath(value: string) {
	fireEvent.input(slot(get("project-picker"), "path-input"), { target: { value } });
}

function press(key: string, modifiers?: { ctrlKey: boolean }) {
	fireEvent.keyDown(slot(get("project-picker"), "path-input"), { key, ...modifiers });
}

beforeEach(() => {
	onAdd.mockClear();
	onOpenSystemPicker.mockClear();
	onClose.mockClear();
	setBrowseDirectories((path) => {
		const resolved = path === "~" ? "/home/jui" : path.replace(/(?<=.)\/$/, "");
		const entries = directories[resolved];

		if (!entries) {
			throw new Error(`ENOENT: ${resolved}`);
		}

		return { path: resolved, directories: entries };
	});
});

afterEach(() => {
	cleanup();
});

describe("Project picker", () => {
	test("opens on the home directory", async () => {
		renderPicker();

		await openedAt("/home/jui/");

		expect(get("project-picker-item", { name: "projects" }).dataset.index).toBe("2");
	});

	test("hides dotted directories until the typed name asks for them", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		expect(query("project-picker-item", { name: ".config" })).toBeNull();

		typePath("/home/jui/.");

		expect(get("project-picker-item", { name: ".config" })).not.toBeNull();
	});

	test("narrows the list to the name being typed", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		typePath("/home/jui/pro");

		expect(get("project-picker-item", { name: "projects" }).dataset.index).toBe("1");
		expect(query("project-picker-item", { name: "downloads" })).toBeNull();
	});

	test("opens the highlighted directory on enter", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		press("ArrowDown");
		press("ArrowDown");
		press("Enter");

		expect(get("project-picker").dataset.path).toBe("/home/jui/downloads/");
		expect(onAdd).not.toHaveBeenCalled();
	});

	test("climbs out of the directory through the first entry", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		press("ArrowDown");
		press("Enter");

		expect(get("project-picker").dataset.path).toBe("/home/");
	});

	test("clears the highlight once a directory is opened", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		press("ArrowDown");

		expect(get("project-picker").dataset.highlighted).toBe("..");

		press("Enter");

		expect(get("project-picker").dataset.highlighted).toBeUndefined();
	});

	test("wraps past the last entry back to no highlight", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		press("ArrowUp");

		expect(get("project-picker").dataset.highlighted).toBe("projects");

		press("ArrowDown");

		expect(get("project-picker").dataset.highlighted).toBeUndefined();
	});

	test("adds the browsed directory when nothing is highlighted", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		press("Enter");

		expect(onAdd).toHaveBeenCalledWith("/home/jui/");
	});

	test("adds the browsed directory even while an entry is highlighted", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		press("ArrowDown");
		press("Enter", { ctrlKey: true });

		expect(onAdd).toHaveBeenCalledWith("/home/jui/");
	});

	test("adds a directory typed by hand", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		typePath("/home/jui/projects/bankai");
		press("Enter");

		expect(onAdd).toHaveBeenCalledWith("/home/jui/projects/bankai");
	});

	test("opens a clicked directory", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		fireEvent.click(get("project-picker-item", { name: "projects" }));

		await openedAt("/home/jui/projects/");
		expect(get("project-picker-item", { name: "bankai" })).not.toBeNull();
	});

	test("closes on escape", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		press("Escape");

		expect(onClose).toHaveBeenCalled();
	});

	test("reports why the directory was refused", async () => {
		renderPicker("Not a directory: /home/jui/readme.md");
		await openedAt("/home/jui/");

		typePath("/home/jui/readme.md");
		press("Enter");

		expect(get("project-picker-notice").dataset.message).toBe("Not a directory: /home/jui/readme.md");
	});

	test("drops the refusal once the path moves on", async () => {
		renderPicker("Not a directory: /home/jui/readme.md");
		await openedAt("/home/jui/");

		typePath("/home/jui/readme.md");
		press("Enter");
		typePath("/home/jui/projects/");

		expect(query("project-picker-notice")).toBeNull();
	});

	test("reports a directory it cannot read", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		typePath("/nowhere/");

		await waitFor(() => {
			expect(query("project-picker-notice")).not.toBeNull();
		});
		expect(get("project-picker-notice").dataset.message).toBeUndefined();
	});

	test("hands over to the system picker", async () => {
		renderPicker();
		await openedAt("/home/jui/");

		fireEvent.click(slot(get("project-picker"), "system-picker"));

		expect(onOpenSystemPicker).toHaveBeenCalled();
	});
});
