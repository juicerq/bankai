import { afterEach, expect, test } from "bun:test";
import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import { MobileNewShell } from "@renderer/routes/mobile/-components/mobile-new-shell";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

afterEach(cleanup);

const AXIOM: Project = { id: "p3", name: "axiom", path: "/projects/axiom", createdAt: 3 };
const BANKAI: Project = { id: "p1", name: "bankai", path: "/projects/bankai", createdAt: 1 };
const GHOSTAPI: Project = { id: "p2", name: "ghostapi", path: "/projects/ghostapi", createdAt: 2 };

function renderNewShell(
	options: {
		projects?: Project[];
		projectActivity?: ReadonlyMap<string, AgentActivityState>;
		onCreate?: (projectId: string) => Promise<void>;
	} = {},
) {
	return render(
		<MobileNewShell
			projects={options.projects ?? [AXIOM, BANKAI, GHOSTAPI]}
			projectActivity={options.projectActivity ?? new Map()}
			onCreate={options.onCreate ?? (async () => {})}
		/>,
	);
}

function options() {
	return [...document.querySelectorAll<HTMLElement>('[data-component="mobile-project-option"]')];
}

function option(projectId: string) {
	return get("mobile-project-option", { projectId });
}

test("the plus opens a picker of the mounted projects, in the order it was handed", () => {
	renderNewShell();

	expect(query("mobile-shell-picker")).toBeNull();

	fireEvent.click(get("mobile-new-shell"));

	expect(options().map((entry) => entry.dataset.projectId)).toEqual(["p3", "p1", "p2"]);
});

test("the picker seats the caret on its first project", () => {
	renderNewShell();

	fireEvent.click(get("mobile-new-shell"));

	expect(document.activeElement).toBe(option("p3"));
});

test("tapping a project opens a shell there", async () => {
	const created: string[] = [];
	renderNewShell({ onCreate: async (projectId) => void created.push(projectId) });

	fireEvent.click(get("mobile-new-shell"));
	fireEvent.click(option("p2"));

	await waitFor(() => expect(created).toEqual(["p2"]));
});

test("a single mounted project has no choice to make, so no picker", async () => {
	const created: string[] = [];
	renderNewShell({ projects: [BANKAI], onCreate: async (projectId) => void created.push(projectId) });

	fireEvent.click(get("mobile-new-shell"));

	await waitFor(() => expect(created).toEqual(["p1"]));
	expect(query("mobile-shell-picker")).toBeNull();
});

test("with no mounted project there is nothing to open", () => {
	renderNewShell({ projects: [] });

	expect(query("mobile-new-shell")).toBeNull();
});

test("an option dot carries the aggregate state of its project", () => {
	renderNewShell({ projectActivity: new Map<string, AgentActivityState>([["p2", "needs-attention"]]) });

	fireEvent.click(get("mobile-new-shell"));

	expect(option("p1").dataset.activity).toBeUndefined();
	expect(slot(option("p1"), "project-dot").className).toContain("bg-outline-strong");
	expect(option("p2").dataset.activity).toBe("needs-attention");
	expect(slot(option("p2"), "project-dot").className).toContain("bg-terminal-blue");
});

test("a rejected spawn says so inside the picker", async () => {
	renderNewShell({ onCreate: async () => Promise.reject(new Error("Project is gone")) });

	fireEvent.click(get("mobile-new-shell"));
	fireEvent.click(option("p1"));

	await waitFor(() => expect(slot(get("mobile-shell-picker"), "problem").textContent).toBe("Project is gone"));
});

test("a rejected spawn from a lone project reveals the picker to carry the reason", async () => {
	renderNewShell({ projects: [BANKAI], onCreate: async () => Promise.reject(new Error("Project is gone")) });

	fireEvent.click(get("mobile-new-shell"));

	await waitFor(() => expect(slot(get("mobile-shell-picker"), "problem").textContent).toBe("Project is gone"));
});

test("cancelling leaves the list untouched and the caret back on the plus", () => {
	renderNewShell();

	fireEvent.click(get("mobile-new-shell"));
	fireEvent.click(slot(get("mobile-shell-picker"), "cancel"));

	expect(query("mobile-shell-picker")).toBeNull();
	expect(document.activeElement).toBe(get("mobile-new-shell"));
});
