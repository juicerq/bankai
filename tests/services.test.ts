import { beforeEach, expect, mock, test } from "bun:test";
import { shellProcesses } from "@main/terminal/ShellProcesses";

interface SpawnedShell {
	sessionId: string;
	shellId: string;
	args: string[];
	killGroup: boolean | undefined;
	onExit: (exit: { exitCode: number; spontaneous: boolean }) => void;
}

const spawned: SpawnedShell[] = [];
const killed: string[] = [];

function finish(sessionId: string, exitCode: number): void {
	const { spontaneous } = shellProcesses.noteExit(sessionId, exitCode);
	spawned.find((shell) => shell.sessionId === sessionId)?.onExit({ exitCode, spontaneous });
}

function die(shell: SpawnedShell | undefined, exitCode: number): void {
	if (shell) {
		finish(shell.sessionId, exitCode);
	}
}

void mock.module("@main/terminal/ShellSpawn", () => ({
	ShellSpawn: {
		run: (input: SpawnedShell & { projectId: string }) => {
			const sessionId = `session-${spawned.length + 1}`;
			const pid = 1000 + spawned.length + 1;

			shellProcesses.register({
				sessionId,
				projectId: input.projectId,
				shellId: input.shellId,
				process: {
					pid,
					write: () => {},
					resize: () => {},
					kill: () => {
						killed.push(input.shellId);
						finish(sessionId, 0);
					},
				},
			});
			spawned.push({ ...input, sessionId });

			return { sessionId, pid };
		},
	},
}));

const { ProjectCommands } = await import("@main/store/commands");
const { Projects } = await import("@main/store/projects");
const { Services } = await import("@main/services/Services");

let projectId: string;

beforeEach(async () => {
	Services.stopAll();
	spawned.length = 0;
	killed.length = 0;
	const project = await Projects.add(process.cwd());
	projectId = project.id;
});

function stateOf(commandId: string) {
	return Services.list().find((state) => state.commandId === commandId);
}

async function service(input: { label: string; command: string; autostart?: boolean }) {
	if (input.autostart) {
		return await ProjectCommands.add({ ...input, projectId, kind: "service", autostart: true });
	}

	return await ProjectCommands.add({ ...input, projectId, kind: "service" });
}

test("starting a service runs its command outside the session list and reports it running", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });

	await Services.start(command.id);

	expect(spawned).toHaveLength(1);
	expect(spawned[0]?.shellId).toBe(command.id);
	expect(spawned[0]?.args.at(-1)).toBe("bun run dev");
	expect(spawned[0]?.killGroup).toBe(true);
	expect(stateOf(command.id)).toEqual(
		expect.objectContaining({ commandId: command.id, projectId, status: "running", pid: 1001 }),
	);
});

test("asking twice leaves exactly one process for a service", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });

	await Services.start(command.id);
	await Services.start(command.id);

	expect(spawned).toHaveLength(1);
});

test("stopping a service ends its process and reports it stopped", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });
	await Services.start(command.id);

	Services.stop(command.id);

	expect(killed).toEqual([command.id]);
	expect(stateOf(command.id)).toEqual(
		expect.objectContaining({ commandId: command.id, status: "stopped", exitCode: 0 }),
	);
});

test("a service that dies on its own reads failed and starts again on demand", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });
	await Services.start(command.id);

	die(spawned[0], 1);

	expect(stateOf(command.id)).toEqual(
		expect.objectContaining({ commandId: command.id, status: "failed", exitCode: 1 }),
	);

	await Services.start(command.id);

	expect(spawned).toHaveLength(2);
	expect(stateOf(command.id)?.status).toBe("running");
});

test("a service that ends cleanly on its own reads stopped, not failed", async () => {
	const command = await service({ label: "Migration", command: "bun run migrate" });
	await Services.start(command.id);

	die(spawned[0], 0);

	expect(stateOf(command.id)?.status).toBe("stopped");
});

test("autostart runs only the services flagged to start with their project", async () => {
	const flagged = await service({ label: "Dev server", command: "bun run dev", autostart: true });
	await service({ label: "Docs", command: "bun run docs" });
	await ProjectCommands.add({ projectId, label: "Tests", command: "bun test", kind: "task" });

	await Services.autostart();

	expect(spawned.map((shell) => shell.shellId)).toEqual([flagged.id]);
});

test("refusing to start a task keeps the process table empty", async () => {
	const task = await ProjectCommands.add({ projectId, label: "Tests", command: "bun test", kind: "task" });

	expect(Services.start(task.id)).rejects.toThrow("Command is not a service");
	expect(spawned).toEqual([]);
});

test("state reaches subscribers on every change", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });
	const seen: (string | undefined)[] = [];
	const stop = Services.subscribe((states) =>
		seen.push(states.find((state) => state.commandId === command.id)?.status)
	);

	await Services.start(command.id);
	die(spawned[0], 1);
	stop();
	await Services.start(command.id);

	expect(seen).toEqual(["running", "failed"]);
});
