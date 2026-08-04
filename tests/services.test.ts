import { beforeEach, expect, mock, test } from "bun:test";
import { TERMINAL_RING_BYTES } from "@main/terminal/buffer/terminal-ring-buffer";
import { shellProcesses } from "@main/terminal/shell-processes";

interface SpawnedShell {
	sessionId: string;
	shellId: string;
	args: string[];
	killGroup: boolean | undefined;
	onData: ((data: string) => void) | undefined;
	onExit: (exit: { exitCode: number; spontaneous: boolean }) => void;
}

const spawned: SpawnedShell[] = [];
const killed: string[] = [];

function finish(sessionId: string, exitCode: number): void {
	const { spontaneous } = shellProcesses.noteExit(sessionId, exitCode);
	spawned.find((shell) => shell.sessionId === sessionId)?.onExit({ exitCode, spontaneous });
}

function emit(shell: SpawnedShell | undefined, data: string): void {
	shell?.onData?.(data);
}

function die(shell: SpawnedShell | undefined, exitCode: number): void {
	if (shell) {
		finish(shell.sessionId, exitCode);
	}
}

void mock.module("@main/terminal/shell-spawn", () => ({
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

const { ProjectCommands } = await import("@main/store/project-commands");
const { Projects } = await import("@main/store/projects");
const { Services } = await import("@main/services");
const { commandsRouter } = await import("@main/transport/rpc/commands-router");
const { call } = await import("@orpc/server");

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

test("a service that crashes keeps its output readable", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });
	await Services.start(command.id);

	emit(spawned[0], "listening on 3000\r\n");
	emit(spawned[0], "Error: port already in use\r\n");
	die(spawned[0], 1);

	expect(Services.output(command.id)).toBe("listening on 3000\r\nError: port already in use\r\n");
});

test("a service that is stopped cleanly keeps its output readable", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });
	await Services.start(command.id);
	emit(spawned[0], "shutting down\r\n");

	Services.stop(command.id);

	expect(Services.output(command.id)).toBe("shutting down\r\n");
});

test("a service that has not run during this launch has no output", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });

	expect(Services.output(command.id)).toBeUndefined();
});

test("retained output keeps only the last megabyte", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });
	await Services.start(command.id);

	emit(spawned[0], "first\r\n");

	for (let chunk = 0; chunk < 20; chunk += 1) {
		emit(spawned[0], "x".repeat(64 * 1024));
	}

	emit(spawned[0], "last\r\n");
	die(spawned[0], 1);

	const output = Services.output(command.id) ?? "";

	expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(TERMINAL_RING_BYTES);
	expect(output.startsWith("first")).toBe(false);
	expect(output.endsWith("last\r\n")).toBe(true);
});

test("starting a service again replaces its retained output", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });
	await Services.start(command.id);
	emit(spawned[0], "first run\r\n");
	die(spawned[0], 1);

	await Services.start(command.id);

	expect(Services.output(command.id)).toBe("");

	emit(spawned[1], "second run\r\n");

	expect(Services.output(command.id)).toBe("second run\r\n");
});

test("removing a service releases its retained output and state", async () => {
	const command = await service({ label: "Dev server", command: "bun run dev" });
	await Services.start(command.id);
	emit(spawned[0], "listening on 3000\r\n");

	await call(commandsRouter.remove, { id: command.id });

	expect(Services.output(command.id)).toBeUndefined();
	expect(stateOf(command.id)).toBeUndefined();
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
