import { afterEach, expect, test } from "bun:test";
import type { Project } from "@shared/projects";
import { ShellPicker } from "@renderer/routes/-features/projects/shell-picker";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

const PROJECTS: Project[] = [
	{ id: "p1", name: "workbench", path: "/home/jui/projects/workbench", createdAt: 1 },
	{ id: "p2", name: "bankai", path: "/home/jui/projects/bankai", createdAt: 2 },
	{ id: "p3", name: "jubby", path: "/home/jui/projects/jubby", createdAt: 3 },
];

function renderPicker(
	options: {
		activeProjectId?: string;
		shellCounts?: ReadonlyMap<string, number>;
		onCreate?: (projectId: string) => void;
		onClose?: () => void;
	} = {},
) {
	return render(
		<ShellPicker
			projects={PROJECTS}
			activeProjectId={options.activeProjectId}
			shellCounts={options.shellCounts ?? new Map()}
			onCreate={options.onCreate ?? (() => {})}
			onClose={options.onClose ?? (() => {})}
		/>,
	);
}

function type(value: string) {
	fireEvent.input(slot(get("shell-picker"), "filter-input"), { target: { value } });
}

function press(key: string) {
	fireEvent.keyDown(slot(get("shell-picker"), "filter-input"), { key });
}

test("projects are listed by name and the current one opens highlighted", () => {
	renderPicker({ activeProjectId: "p3" });

	expect(get("shell-picker-item", { name: "bankai" }).dataset.index).toBe("0");
	expect(get("shell-picker").dataset.highlighted).toBe("p3");
});

test("chosen projects return in recent order with the last choice highlighted", () => {
	renderPicker();
	fireEvent.click(get("shell-picker-item", { name: "workbench" }));
	cleanup();

	renderPicker();
	fireEvent.click(get("shell-picker-item", { name: "jubby" }));
	cleanup();

	renderPicker({ activeProjectId: "p2" });

	expect(get("shell-picker-item", { name: "jubby" }).dataset.index).toBe("0");
	expect(get("shell-picker-item", { name: "workbench" }).dataset.index).toBe("1");
	expect(get("shell-picker-item", { name: "bankai" }).dataset.index).toBe("2");
	expect(get("shell-picker").dataset.highlighted).toBe("p3");
});

test("the first project takes the highlight when none is current", () => {
	renderPicker();

	expect(get("shell-picker").dataset.highlighted).toBe("p2");
});

test("enter creates in the highlighted project and closes", () => {
	const created: string[] = [];
	let closed = 0;
	renderPicker({ activeProjectId: "p1", onCreate: (projectId) => created.push(projectId), onClose: () => (closed += 1) });

	press("Enter");

	expect(created).toEqual(["p1"]);
	expect(closed).toBe(1);
});

test("the filter narrows on the name and leaves the shared path alone", () => {
	renderPicker();

	type("ban");

	expect(get("shell-picker-item", { name: "bankai" }).dataset.index).toBe("0");
	expect(query("shell-picker-item", { name: "jubby" })).toBeNull();

	type("jui");

	expect(query("shell-picker-item")).toBeNull();
});

test("a filter that drops the highlighted project hands the highlight on", () => {
	renderPicker({ activeProjectId: "p1" });

	type("ju");

	expect(get("shell-picker").dataset.highlighted).toBe("p3");
});

test("the arrows walk the list and wrap", () => {
	renderPicker({ activeProjectId: "p2" });

	press("ArrowUp");

	expect(get("shell-picker").dataset.highlighted).toBe("p1");

	press("ArrowDown");

	expect(get("shell-picker").dataset.highlighted).toBe("p2");
});

test("a clicked project creates in it", () => {
	const created: string[] = [];
	renderPicker({ onCreate: (projectId) => created.push(projectId) });

	fireEvent.click(get("shell-picker-item", { name: "jubby" }));

	expect(created).toEqual(["p3"]);
});

test("enter creates nothing when the filter matches no project", () => {
	const created: string[] = [];
	renderPicker({ onCreate: (projectId) => created.push(projectId) });

	type("nowhere");
	press("Enter");

	expect(created).toEqual([]);
	expect(get("shell-picker").dataset.highlighted).toBeUndefined();
});

test("a project already carrying shells says how many", () => {
	renderPicker({ shellCounts: new Map([["p3", 1], ["p1", 4]]) });

	expect(slot(get("shell-picker-item", { name: "jubby" }), "shell-count").textContent).toBe("1 SHELL");
	expect(slot(get("shell-picker-item", { name: "workbench" }), "shell-count").textContent).toBe("4 SHELLS");
	expect(query("shell-picker-item", { name: "bankai" })?.querySelector("[data-slot=shell-count]")).toBeNull();
});

test("escape closes without creating", () => {
	const created: string[] = [];
	let closed = 0;
	renderPicker({ onCreate: (projectId) => created.push(projectId), onClose: () => (closed += 1) });

	press("Escape");

	expect(closed).toBe(1);
	expect(created).toEqual([]);
});
