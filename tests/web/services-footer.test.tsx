import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { ProjectCommand } from "@main/store/project-commands";
import type { Project } from "@main/store/projects";
import { ServicesFooter } from "@renderer/routes/-components/services-footer";
import type { ServiceState } from "@shared/services";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

const projects: Project[] = [{ id: "alpha", name: "alpha", path: "/projects/alpha", createdAt: 1 }];

const services: ProjectCommand[] = [
	{ id: "api", projectId: "alpha", label: "api", command: "bun dev", kind: "service", createdAt: 1 },
	{ id: "worker", projectId: "alpha", label: "worker", command: "bun work", kind: "service", createdAt: 2 },
];

const states = new Map<string, ServiceState>([
	["api", { commandId: "api", projectId: "alpha", status: "running", pid: 4242 }],
	["worker", { commandId: "worker", projectId: "alpha", status: "failed", exitCode: 1 }],
]);

afterEach(cleanup);

function Harness() {
	const [acted, setActed] = useState("");

	return (
		<>
			<span data-component="footer-state" data-acted={acted} />
			<ServicesFooter
				services={services}
				projects={projects}
				open
				states={states}
				openedCommandId={undefined}
				onToggle={() => {}}
				onStart={(commandId) => setActed(`start:${commandId}`)}
				onStop={(commandId) => setActed(`stop:${commandId}`)}
				onRestart={(commandId) => setActed(`restart:${commandId}`)}
				onRemove={(commandId) => setActed(`remove:${commandId}`)}
				onOpenLog={(commandId) => setActed(`log:${commandId}`)}
			/>
		</>
	);
}

function actionSlots(commandId: string) {
	return [...get("service-row", { commandId }).querySelectorAll<HTMLElement>("[data-slot]")]
		.map((element) => element.dataset.slot)
		.filter((name) => name?.endsWith("-service"));
}

test("a running service offers restart, stop and delete in that order", () => {
	render(<Harness />);

	expect(actionSlots("api")).toEqual(["restart-service", "stop-service", "delete-service"]);

	fireEvent.click(slot(get("service-row", { commandId: "api" }), "restart-service"));

	expect(get("footer-state").dataset.acted).toBe("restart:api");
});

test("a failed service offers start and delete, with no restart", () => {
	render(<Harness />);

	expect(actionSlots("worker")).toEqual(["start-service", "delete-service"]);

	fireEvent.click(slot(get("service-row", { commandId: "worker" }), "start-service"));

	expect(get("footer-state").dataset.acted).toBe("start:worker");
});

test("the status dot no longer acts and the label still opens the output", () => {
	render(<Harness />);

	const row = get("service-row", { commandId: "api" });
	expect(slot(row, "service-status").tagName).toBe("SPAN");

	fireEvent.click(slot(row, "open-service-log"));

	expect(get("footer-state").dataset.acted).toBe("log:api");
});

test("deleting arms in place and removes the command on the second click", () => {
	render(<Harness />);

	const row = get("service-row", { commandId: "api" });
	fireEvent.click(slot(row, "delete-service"));

	expect(get("footer-state").dataset.acted).toBe("");
	expect(query("remove-service-confirm")).toBeNull();

	fireEvent.click(slot(row, "confirm-delete-service"));

	expect(get("footer-state").dataset.acted).toBe("remove:api");
	expect(actionSlots("api")).toContain("delete-service");
});

test("leaving the row disarms the delete", () => {
	render(<Harness />);

	const row = get("service-row", { commandId: "api" });
	fireEvent.click(slot(row, "delete-service"));
	fireEvent.mouseLeave(row);

	expect(actionSlots("api")).toEqual(["restart-service", "stop-service", "delete-service"]);
	expect(get("footer-state").dataset.acted).toBe("");
});

test("arming one row leaves the other row unarmed", () => {
	render(<Harness />);
	fireEvent.click(slot(get("service-row", { commandId: "api" }), "delete-service"));

	expect(actionSlots("worker")).toEqual(["start-service", "delete-service"]);
	expect(actionSlots("api")).toEqual(["restart-service", "stop-service", "confirm-delete-service"]);
});
