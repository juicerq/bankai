import { afterEach, expect, test } from "bun:test";
import type { Project } from "@shared/projects";
import { SettingsProjects } from "@renderer/routes/-features/settings/settings-projects";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

const projects: Project[] = [
	{ id: "alpha", name: "alpha", path: "/projects/alpha", createdAt: 1 },
	{ id: "zulu", name: "zulu", path: "/projects/zulu", createdAt: 2 },
];
const originalClipboard = navigator.clipboard;

afterEach(() => {
	cleanup();
	Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
});

function renderProjects(options: {
	shellCounts?: ReadonlyMap<string, number>;
	onOpenDirectory?: (path: string) => void;
	onRemove?: (projectId: string) => void;
} = {}) {
	return render(
		<SettingsProjects
			projects={projects}
			shellCounts={options.shellCounts ?? new Map()}
			onOpenDirectory={options.onOpenDirectory ?? (() => {})}
			onRemove={options.onRemove ?? (() => {})}
		/>,
	);
}

function openActions(projectId: string) {
	fireEvent.click(slot(get("settings-project", { projectId }), "project-actions"));

	return get("settings-project-menu");
}

test("lists every project in settings", () => {
	renderProjects();

	expect(get("settings-project", { projectId: "alpha" })).toBeDefined();
	expect(get("settings-project", { projectId: "zulu" })).toBeDefined();
});

test("opens a project's directory from its actions", () => {
	const opened: string[] = [];
	renderProjects({ onOpenDirectory: (path) => opened.push(path) });

	fireEvent.click(slot(openActions("zulu"), "open-project-directory"));

	expect(opened).toEqual(["/projects/zulu"]);
	expect(query("settings-project-menu")).toBeNull();
});

test("copies a project's path from its actions", () => {
	const copied: string[] = [];
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: async (path: string) => copied.push(path) },
	});
	renderProjects();

	fireEvent.click(slot(openActions("alpha"), "copy-project-path"));

	expect(copied).toEqual(["/projects/alpha"]);
	expect(query("settings-project-menu")).toBeNull();
});

test("removes a project with no sessions immediately", () => {
	const removed: string[] = [];
	renderProjects({ onRemove: (projectId) => removed.push(projectId) });

	fireEvent.click(slot(openActions("alpha"), "remove-project"));

	expect(removed).toEqual(["alpha"]);
	expect(query("remove-project-confirm")).toBeNull();
});

test("confirms before removing a project with open sessions", () => {
	const removed: string[] = [];
	renderProjects({
		shellCounts: new Map([["alpha", 2]]),
		onRemove: (projectId) => removed.push(projectId),
	});

	fireEvent.click(slot(openActions("alpha"), "remove-project"));

	expect(removed).toEqual([]);
	fireEvent.click(slot(get("remove-project-confirm"), "confirm-accept"));
	expect(removed).toEqual(["alpha"]);
});
