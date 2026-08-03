import { expect, spyOn, test } from "bun:test";
import { WebSocket } from "ws";
import { AgentActivity } from "@main/activity/AgentActivity";
import { StreamConnection } from "@main/server/stream/connection";
import { detachOnClose, handleTerminalMessage } from "@main/server/stream/terminal";
import { Continuity } from "@main/store/continuity";
import { shellProcesses, type TerminalProcess } from "@main/terminal/ShellProcesses";
import { TERMINAL_DATA_FLUSH_MS } from "@main/terminal/TerminalDataBuffer";
import type { StreamEnvelope } from "@shared/stream";
import type { TerminalStreamEvent } from "@shared/terminal";

class FakeProcess implements TerminalProcess {
	readonly pid = 4242;
	writes: string[] = [];

	write(data: string) {
		this.writes = [...this.writes, data];
	}

	resize() {}

	kill() {}
}

function connected() {
	return new StreamConnection({ readyState: WebSocket.CLOSED, send: () => {} });
}

function running(shellId: string) {
	const terminal = new FakeProcess();
	const sessionId = `session-${shellId}`;

	shellProcesses.register({ projectId: "p1", shellId, sessionId, process: terminal });

	return { terminal, sessionId };
}

function attach(sessionId: string, connection: StreamConnection) {
	const events: TerminalStreamEvent[] = [];

	shellProcesses.attach(sessionId, {
		connectionId: connection.id,
		send: (event) => events.push(event),
	});

	return events;
}

async function flushed() {
	await new Promise((resolve) => setTimeout(resolve, TERMINAL_DATA_FLUSH_MS * 2));
}

test("an attachment that landed after its connection closed lets go of the shell at once", async () => {
	const gone = connected();
	const { sessionId } = running("late-attach");
	gone.close();

	const missed = attach(sessionId, gone);
	const seen = attach(sessionId, connected());
	detachOnClose(gone, { sessionId });
	shellProcesses.noteData(sessionId, "output the phone will never see");
	await flushed();

	expect(missed).toEqual([]);
	expect(seen).not.toEqual([]);
});

test("an attachment made while the connection was open is let go when it closes", async () => {
	const connection = connected();
	const { sessionId } = running("close-later");

	const events = attach(sessionId, connection);
	detachOnClose(connection, { sessionId });
	connection.close();
	shellProcesses.noteData(sessionId, "output after the phone went away");
	await flushed();

	expect(events).toEqual([]);
});

function envelope(type: string, payload: unknown): StreamEnvelope {
	return { channel: "terminal", type, payload };
}

test("a prompt is refused when no agent is listening to the shell", async () => {
	const { terminal } = running("no-agent");

	const refused = await handleTerminalMessage(
		connected(),
		envelope("prompt", { projectId: "p1", shellId: "no-agent", text: "hello" }),
	).catch((err) => String(err));

	expect(refused).toInclude("No agent is listening to this shell");
	expect(terminal.writes).toEqual([]);
});

test("attaching reads a running process without opening a new one", async () => {
	const { sessionId } = running("service-log");
	shellProcesses.noteData(sessionId, "listening on 4700");
	await flushed();

	const attached = await handleTerminalMessage(
		connected(),
		envelope("attach", { projectId: "p1", shellId: "service-log" }),
	);

	expect(attached).toEqual({ sessionId, replay: "listening on 4700" });
});

test("attaching to a process that is not running is refused instead of spawning one", async () => {
	const refused = await handleTerminalMessage(
		connected(),
		envelope("attach", { projectId: "p1", shellId: "never-started" }),
	).catch((err) => String(err));

	expect(refused).toInclude("This process is not running");
});

async function archived(shellId: string): Promise<void> {
	await Continuity.openShell({ projectId: "p1", shell: { id: shellId } });
	await Continuity.archiveShell({ projectId: "p1", shellId });
}

async function stillArchived(shellId: string): Promise<boolean> {
	return !!(await Continuity.findShell({ projectId: "p1", shellId }))?.archivedAt;
}

async function unarchived(shellId: string): Promise<boolean> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (!(await stillArchived(shellId))) {
			return true;
		}

		await Bun.sleep(5);
	}

	return false;
}

test("a prompt to an archived shell brings it back out of the archive", async () => {
	const { sessionId, terminal } = running("prompt-archived");
	await archived("prompt-archived");
	spyOn(AgentActivity, "liveAgentSessions").mockReturnValue(new Set([sessionId]));

	await handleTerminalMessage(
		connected(),
		envelope("prompt", { projectId: "p1", shellId: "prompt-archived", text: "hello" }),
	);

	expect(terminal.writes.at(-1)).toBe("\r");
	expect(await stillArchived("prompt-archived")).toBe(false);
});

test("typing Enter into an archived shell brings it back out of the archive", async () => {
	const { sessionId } = running("write-enter");
	await archived("write-enter");

	await handleTerminalMessage(connected(), envelope("write", { sessionId, data: "ls\r" }));

	expect(await unarchived("write-enter")).toBe(true);
});

test("typing without Enter leaves an archived shell archived", async () => {
	const { sessionId } = running("write-keys");
	await archived("write-keys");

	await handleTerminalMessage(connected(), envelope("write", { sessionId, data: "ls" }));
	await Bun.sleep(50);

	expect(await stillArchived("write-keys")).toBe(true);
});

test("the Enter key brings an archived shell back out of the archive", async () => {
	running("key-enter");
	await archived("key-enter");

	await handleTerminalMessage(connected(), envelope("key", { projectId: "p1", shellId: "key-enter", key: "enter" }));

	expect(await stillArchived("key-enter")).toBe(false);
});

test("an arrow key leaves an archived shell archived", async () => {
	running("key-up");
	await archived("key-up");

	await handleTerminalMessage(connected(), envelope("key", { projectId: "p1", shellId: "key-up", key: "up" }));

	expect(await stillArchived("key-up")).toBe(true);
});

test("a key press reaches the shell whether or not an agent is running", async () => {
	const { terminal } = running("keys");

	await handleTerminalMessage(connected(), envelope("key", { projectId: "p1", shellId: "keys", key: "enter" }));

	expect(terminal.writes).toEqual(["\r"]);
});
