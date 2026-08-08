import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { Project } from "@shared/projects";
import { ProjectFooter } from "@renderer/routes/-features/projects/project-footer";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

const projects: Project[] = [
	{ id: "zulu", name: "zulu", path: "/projects/zulu", createdAt: 1 },
	{ id: "alpha", name: "alpha", path: "/projects/alpha", createdAt: 2 },
];

afterEach(cleanup);

function Harness({ shellCounts = new Map<string, number>() }: { shellCounts?: ReadonlyMap<string, number> }) {
	const [open, setOpen] = useState(false);
	const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
	const [removed, setRemoved] = useState("");

	return (
		<>
			<span data-component="footer-state" data-removed={removed} />
			<ProjectFooter
				projects={projects}
				loading={false}
				open={open}
				shellCounts={shellCounts}
				chosenProjectIds={chosen}
				onToggle={() => setOpen((current) => !current)}
				onToggleProject={(projectId) => setChosen(new Set([projectId]))}
				onAdd={() => {}}
				onOpenDirectory={() => {}}
				onRemove={setRemoved}
			/>
		</>
	);
}

function rowNames() {
	return [...get("project-footer").querySelectorAll<HTMLElement>('[data-component="project-row"]')]
		.map((row) => row.dataset.projectId);
}

function menuItem(label: string) {
	const match = [...get("project-row-menu").querySelectorAll<HTMLElement>('[role="menuitem"]')]
		.find((item) => item.textContent === label);

	if (!match) {
		throw new Error(`No menu item labelled ${label}`);
	}

	return match;
}

test("the section starts closed and opens on the header toggle", () => {
	render(<Harness />);

	const toggle = slot(get("project-footer"), "toggle-projects");
	expect(toggle.getAttribute("aria-expanded")).toBe("false");
	expect(rowNames()).toEqual([]);

	fireEvent.click(toggle);

	expect(toggle.getAttribute("aria-expanded")).toBe("true");
	expect(rowNames()).toEqual(["alpha", "zulu"]);
});

test("a project row narrows the sessions instead of opening one", () => {
	render(<Harness />);
	fireEvent.click(slot(get("project-footer"), "toggle-projects"));

	const row = get("project-row", { projectId: "zulu" });
	expect(row.getAttribute("aria-pressed")).toBe("false");

	fireEvent.click(row);

	expect(get("project-row", { projectId: "zulu" }).getAttribute("aria-pressed")).toBe("true");
	expect(get("project-row", { projectId: "alpha" }).getAttribute("aria-pressed")).toBe("false");
});

test("a project with no open shells is removed without asking", () => {
	render(<Harness />);
	fireEvent.click(slot(get("project-footer"), "toggle-projects"));
	fireEvent.contextMenu(get("project-row", { projectId: "alpha" }), { clientX: 10, clientY: 10 });

	fireEvent.click(menuItem("Remove from list"));

	expect(query("remove-project-confirm")).toBeNull();
	expect(get("footer-state").dataset.removed).toBe("alpha");
});

test("removing a project with open shells names how many before it goes", () => {
	render(<Harness shellCounts={new Map([["alpha", 3]])} />);
	fireEvent.click(slot(get("project-footer"), "toggle-projects"));
	fireEvent.contextMenu(get("project-row", { projectId: "alpha" }), { clientX: 10, clientY: 10 });
	fireEvent.click(menuItem("Remove from list"));

	const confirm = get("remove-project-confirm");
	expect(slot(confirm, "confirm-message").textContent).toContain("3 open shells");
	expect(get("footer-state").dataset.removed).toBe("");

	fireEvent.click(slot(confirm, "confirm-accept"));

	expect(query("remove-project-confirm")).toBeNull();
	expect(get("footer-state").dataset.removed).toBe("alpha");
});

test("cancelling the confirmation keeps the project", () => {
	render(<Harness shellCounts={new Map([["alpha", 1]])} />);
	fireEvent.click(slot(get("project-footer"), "toggle-projects"));
	fireEvent.contextMenu(get("project-row", { projectId: "alpha" }), { clientX: 10, clientY: 10 });
	fireEvent.click(menuItem("Remove from list"));

	expect(slot(get("remove-project-confirm"), "confirm-message").textContent).toContain("1 open shell");

	fireEvent.click(slot(get("remove-project-confirm"), "confirm-cancel"));

	expect(query("remove-project-confirm")).toBeNull();
	expect(get("footer-state").dataset.removed).toBe("");
});
