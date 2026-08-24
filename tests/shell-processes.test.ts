import { beforeEach, expect, test } from "bun:test";
import {
	type ShellAttachment,
	ShellProcesses,
	type TerminalProcess,
} from "@main/terminal/shell-processes";
import { TERMINAL_DATA_FLUSH_MS } from "@main/terminal/buffer/terminal-data-buffer";
import type { TerminalStreamEvent } from "@shared/terminal";

const SHELL = { projectId: "p1", shellId: "s1" };

const KILL_GRACE_MS = 20;

const HOME = "\u001b[1;1H";

const FAR_RIGHT = "\u001b[100C";

class FakeProcess implements TerminalProcess {
	readonly pid = 4242;
	writes: string[] = [];
	readonly resizes: { cols: number; rows: number }[] = [];
	readonly signals: (string | undefined)[] = [];
	killed = 0;

	write(data: string) {
		this.writes = [...this.writes, data];
	}

	resize(cols: number, rows: number) {
		this.resizes.push({ cols, rows });
	}

	kill(signal?: string) {
		this.killed += 1;
		this.signals.push(signal);
	}
}

class FakeConnection implements ShellAttachment {
	events: TerminalStreamEvent[] = [];

	constructor(readonly connectionId: string) {}

	readonly send = (event: TerminalStreamEvent) => {
		this.events = [...this.events, event];
	};

	dataSeen() {
		return this.events.filter((event) => event.type === "data").map((event) => event.payload.data);
	}
}

let processes: ShellProcesses;
let terminal: FakeProcess;

function register(sessionId: string) {
	processes.register({ ...SHELL, sessionId, process: terminal, cols: 80, rows: 24 });
}

async function flushed() {
	await new Promise((resolve) => setTimeout(resolve, TERMINAL_DATA_FLUSH_MS * 2));
}

beforeEach(() => {
	processes = new ShellProcesses();
	terminal = new FakeProcess();
});

test("a second connection attaching to the same shell finds the running process", () => {
	register("session-1");

	expect(processes.find(SHELL)).toBe("session-1");
});

test("output reaches every attached connection", async () => {
	register("session-1");
	const desktop = new FakeConnection("desktop");
	const phone = new FakeConnection("phone");
	await processes.attach("session-1", desktop);
	await processes.attach("session-1", phone);

	processes.noteData("session-1", "hello");
	await flushed();

	expect(desktop.dataSeen()).toEqual(["hello"]);
	expect(phone.dataSeen()).toEqual(["hello"]);
});

test("attaching replays the scrollback written before the connection existed", async () => {
	register("session-1");
	const desktop = new FakeConnection("desktop");
	await processes.attach("session-1", desktop);
	processes.noteData("session-1", "earlier");
	await flushed();

	const replay = await processes.attach("session-1", new FakeConnection("phone"));

	expect(replay).toBe("earlier");
});

test("what the replay carries is never delivered twice to the connection that asked for it", async () => {
	register("session-1");
	processes.noteData("session-1", "earlier");
	const phone = new FakeConnection("phone");

	const replay = await processes.attach("session-1", phone);
	await flushed();

	expect(replay).toBe("earlier");
	expect(phone.dataSeen()).toEqual([]);
});

test("any attached connection may write to the process", async () => {
	register("session-1");
	await processes.attach("session-1", new FakeConnection("desktop"));
	await processes.attach("session-1", new FakeConnection("phone"));

	processes.write("session-1", "from desktop");
	processes.write("session-1", "from phone");

	expect(terminal.writes).toEqual(["from desktop", "from phone"]);
});

test("a screen of a different size attaching resizes the process before it reads the replay", async () => {
	register("session-1");
	processes.noteData("session-1", `${HOME}${FAR_RIGHT}X`);

	await processes.attach("session-1", new FakeConnection("phone"), { cols: 12, rows: 20 });

	expect(terminal.resizes).toEqual([{ cols: 12, rows: 20 }]);
});

test("output that arrived before the attach is laid out at the width the shell wrote it at", async () => {
	register("session-1");
	processes.noteData("session-1", `${HOME}${FAR_RIGHT}X`);

	const replay = await processes.attach("session-1", new FakeConnection("phone"), { cols: 120, rows: 24 });

	expect(replay).toBe("\u001b[79CX");
});

test("a viewer that names no size attaches without disturbing the process", async () => {
	register("session-1");

	await processes.attach("session-1", new FakeConnection("phone"));

	expect(terminal.resizes).toEqual([]);
});

test("a screen the same size as the process attaches without a needless resize", async () => {
	register("session-1");

	await processes.attach("session-1", new FakeConnection("phone"), { cols: 80, rows: 24 });

	expect(terminal.resizes).toEqual([]);
});

test("output that arrived before the attach is in the replay and never sent as an event too", async () => {
	register("session-1");
	processes.noteData("session-1", "earlier");
	const phone = new FakeConnection("phone");

	const replay = await processes.attach("session-1", phone, { cols: 80, rows: 24 });
	await flushed();

	expect(replay).toBe("earlier");
	expect(phone.events).toEqual([]);
});

test("a shell that dies while the attach is reading it refuses the attach instead of handing back a dead session", async () => {
	register("session-1");
	processes.noteData("session-1", "last words");

	const attaching = processes.attach("session-1", new FakeConnection("phone"));
	processes.noteExit("session-1", 0);

	expect(await attaching.then(() => "attached", String)).toInclude("shell exited during attach");
});

test("the last resize wins with no negotiation between connections", () => {
	register("session-1");

	processes.resize("session-1", 80, 24);
	processes.resize("session-1", 40, 12);

	expect(terminal.resizes.at(-1)).toEqual({ cols: 40, rows: 12 });
});

test("a connection going away detaches it without touching the process", async () => {
	register("session-1");
	const desktop = new FakeConnection("desktop");
	const phone = new FakeConnection("phone");
	await processes.attach("session-1", desktop);
	await processes.attach("session-1", phone);

	processes.detach("session-1", "phone");
	processes.noteData("session-1", "still running");
	await flushed();

	expect(terminal.killed).toBe(0);
	expect(processes.find(SHELL)).toBe("session-1");
	expect(desktop.dataSeen()).toEqual(["still running"]);
	expect(phone.dataSeen()).toEqual([]);
});

test("detaching the last connection leaves the process alive", async () => {
	register("session-1");
	await processes.attach("session-1", new FakeConnection("desktop"));

	processes.detach("session-1", "desktop");

	expect(terminal.killed).toBe(0);
	expect(processes.list()).toEqual([{ ...SHELL, sessionId: "session-1", pid: terminal.pid }]);
});

test("closing the shell kills its process and frees the shell for a fresh one", () => {
	register("session-1");

	processes.closeShell(SHELL);

	expect(terminal.killed).toBe(1);
	expect(processes.find(SHELL)).toBeUndefined();
	expect(processes.list()).toEqual([]);
});

test("an exit the app asked for does not read as the agent session dying on its own", () => {
	register("session-1");
	processes.close("session-1");

	expect(processes.noteExit("session-1", 0)).toEqual({ spontaneous: false });
});

test("an exit nobody asked for reports itself as spontaneous", () => {
	register("session-1");

	expect(processes.noteExit("session-1", 1)).toEqual({ spontaneous: true });
});

test("shutdown reports the shells to terminate and keeps their exit from reading as spontaneous", () => {
	register("session-1");

	expect(processes.noteShutdown()).toEqual([{ ...SHELL, sessionId: "session-1", pid: terminal.pid }]);
	expect(processes.noteExit("session-1", 0)).toEqual({ spontaneous: false });
});

test("every attached connection is told the process exited", async () => {
	register("session-1");
	const desktop = new FakeConnection("desktop");
	const phone = new FakeConnection("phone");
	await processes.attach("session-1", desktop);
	await processes.attach("session-1", phone);

	processes.noteExit("session-1", 3);

	const exit: TerminalStreamEvent = { type: "exit", payload: { sessionId: "session-1", exitCode: 3 } };
	expect(desktop.events).toEqual([exit]);
	expect(phone.events).toEqual([exit]);
});

test("a process that ignores the kill is forced out instead of leaking its session", async () => {
	const stubborn = new ShellProcesses(KILL_GRACE_MS);
	stubborn.register({ ...SHELL, sessionId: "session-1", process: terminal, cols: 80, rows: 24 });
	const desktop = new FakeConnection("desktop");
	await stubborn.attach("session-1", desktop);

	stubborn.close("session-1");
	await new Promise((resolve) => setTimeout(resolve, KILL_GRACE_MS * 4));

	expect(terminal.signals).toEqual([undefined, "SIGKILL"]);
	expect(stubborn.list()).toEqual([]);
	expect(desktop.events.at(-1)?.type).toBe("exit");
});

test("a process that exits when asked is never forced", async () => {
	const polite = new ShellProcesses(KILL_GRACE_MS);
	polite.register({ ...SHELL, sessionId: "session-1", process: terminal, cols: 80, rows: 24 });

	polite.close("session-1");
	polite.noteExit("session-1", 0);
	await new Promise((resolve) => setTimeout(resolve, KILL_GRACE_MS * 4));

	expect(terminal.signals).toEqual([undefined]);
});

test("output buffered when the process was closed still reaches the screen", async () => {
	register("session-1");
	const desktop = new FakeConnection("desktop");
	await processes.attach("session-1", desktop);
	processes.noteData("session-1", "last words");

	processes.close("session-1");

	expect(desktop.dataSeen()).toEqual(["last words"]);
});
