import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { ProjectCommand } from "@shared/project-commands";
import type { Project } from "@shared/projects";
import { CommandsFooter } from "@renderer/routes/-features/commands/commands-footer";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

const projects: Project[] = [{ id: "alpha", name: "bankai", path: "/projects/bankai", createdAt: 1, reviewClosedTargets: [] }];
const commands: ProjectCommand[] = [
	{ id: "test", projectId: "alpha", label: "test", command: "bun test", kind: "task", createdAt: 1 },
];

afterEach(cleanup);

test("the commands section remains available when there are no commands", () => {
	render(
		<CommandsFooter
			commands={[]}
			projects={projects}
			open
			onToggle={() => {}}
			onRun={() => {}}
			onRemove={() => {}}
		/>,
	);

	expect(get("commands-footer").textContent).toContain("COMMANDS 0");
	expect(slot(get("commands-footer"), "empty-commands").textContent).toContain("No commands yet");
});

test("a command can be run and removed from its sidebar row", () => {
	function Harness() {
		const [acted, setActed] = useState("");

		return (
			<>
				<span data-component="commands-state" data-acted={acted} />
				<CommandsFooter
					commands={commands}
					projects={projects}
					open
					onToggle={() => {}}
					onRun={(command) => setActed(`run:${command.id}`)}
					onRemove={(commandId) => setActed(`remove:${commandId}`)}
				/>
			</>
		);
	}

	render(<Harness />);
	const row = get("sidebar-command-row", { commandId: "test" });

	fireEvent.click(slot(row, "command-identity"));
	expect(get("commands-state").dataset.acted).toBe("");

	fireEvent.click(slot(row, "run-command"));
	expect(get("commands-state").dataset.acted).toBe("run:test");

	fireEvent.click(slot(row, "delete-command"));
	fireEvent.click(slot(row, "confirm-delete-command"));
	expect(get("commands-state").dataset.acted).toBe("remove:test");
});
