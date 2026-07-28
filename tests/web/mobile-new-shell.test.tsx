import { afterEach, expect, test } from "bun:test";
import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import { MobileNewShell } from "@renderer/routes/mobile/-components/mobile-new-shell";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

afterEach(cleanup);

const BANKAI: Project = { id: "p1", name: "bankai", path: "/projects/bankai", createdAt: 1 };
const GHOSTAPI: Project = { id: "p2", name: "ghostapi", path: "/projects/ghostapi", createdAt: 2 };
const AXIOM: Project = { id: "p3", name: "axiom", path: "/projects/axiom", createdAt: 3 };

function renderNewShell(
	options: {
		projects?: Project[];
		projectActivity?: ReadonlyMap<string, AgentActivityState>;
		onCreate?: (projectId: string) => Promise<void>;
	} = {},
) {
	return render(
		<MobileNewShell
			projects={options.projects ?? [BANKAI, GHOSTAPI, AXIOM]}
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

test("the plus opens a sheet of the mounted projects, in project order", () => {
	renderNewShell();

	expect(query("mobile-project-sheet")).toBeNull();

	fireEvent.click(get("mobile-new-shell"));

	expect(options().map((entry) => entry.dataset.projectId)).toEqual(["p3", "p1", "p2"]);
});

test("tapping a project opens a shell there", async () => {
	const created: string[] = [];
	renderNewShell({ onCreate: async (projectId) => void created.push(projectId) });

	fireEvent.click(get("mobile-new-shell"));
	fireEvent.click(option("p2"));

	await waitFor(() => expect(created).toEqual(["p2"]));
});

test("a single mounted project has no choice to make, so no sheet", async () => {
	const created: string[] = [];
	renderNewShell({ projects: [BANKAI], onCreate: async (projectId) => void created.push(projectId) });

	fireEvent.click(get("mobile-new-shell"));

	await waitFor(() => expect(created).toEqual(["p1"]));
	expect(query("mobile-project-sheet")).toBeNull();
});

test("with no mounted project there is nothing to open", () => {
	renderNewShell({ projects: [] });

	expect(query("mobile-new-shell")).toBeNull();
});

test("an option dot carries the aggregate state of its project", () => {
	renderNewShell({ projectActivity: new Map<string, AgentActivityState>([["p2", "needs-attention"]]) });

	fireEvent.click(get("mobile-new-shell"));

	expect(option("p1").dataset.activity).toBeUndefined();
	expect(option("p2").dataset.activity).toBe("needs-attention");
});

test("a rejected spawn says so inside the sheet", async () => {
	renderNewShell({ onCreate: async () => Promise.reject(new Error("Project is gone")) });

	fireEvent.click(get("mobile-new-shell"));
	fireEvent.click(option("p1"));

	await waitFor(() => expect(slot(get("mobile-project-sheet"), "problem").textContent).toBe("Project is gone"));
});

test("a rejected spawn from a lone project reveals the sheet to carry the reason", async () => {
	renderNewShell({ projects: [BANKAI], onCreate: async () => Promise.reject(new Error("Project is gone")) });

	fireEvent.click(get("mobile-new-shell"));

	await waitFor(() => expect(slot(get("mobile-project-sheet"), "problem").textContent).toBe("Project is gone"));
});

test("cancelling leaves the list untouched", () => {
	renderNewShell();

	fireEvent.click(get("mobile-new-shell"));
	fireEvent.click(slot(get("mobile-project-sheet"), "cancel"));

	expect(query("mobile-project-sheet")).toBeNull();
});
