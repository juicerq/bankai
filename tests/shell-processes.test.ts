import { beforeEach, expect, test } from "bun:test";
import {
	type ShellAttachment,
	ShellProcesses,
	type TerminalProcess,
} from "@main/terminal/ShellProcesses";
import { TERMINAL_DATA_FLUSH_MS } from "@main/terminal/TerminalDataBuffer";
import type { TerminalStreamEvent } from "@shared/terminal";

const SHELL = { projectId: "p1", shellId: "s1" };

class FakeProcess implements TerminalProcess {
	readonly pid = 4242;
	writes: string[] = [];
	readonly resizes: { cols: number; rows: number }[] = [];
	killed = 0;

	write(data: string) {
		this.writes = [...this.writes, data];
	}

	resize(cols: number, rows: number) {
		this.resizes.push({ cols, rows });
	}

	kill() {
		this.killed += 1;
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
	processes.register({ ...SHELL, sessionId, process: terminal });
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
	processes.attach("session-1", desktop);
	processes.attach("session-1", phone);

	processes.noteData("session-1", "hello");
	await flushed();

	expect(desktop.dataSeen()).toEqual(["hello"]);
	expect(phone.dataSeen()).toEqual(["hello"]);
});

test("attaching replays the scrollback written before the connection existed", async () => {
	register("session-1");
	const desktop = new FakeConnection("desktop");
	processes.attach("session-1", desktop);
	processes.noteData("session-1", "earlier");
	await flushed();

	const replay = processes.attach("session-1", new FakeConnection("phone"));

	expect(replay).toBe("earlier");
});

test("what the replay carries is never delivered twice to the connection that asked for it", async () => {
	register("session-1");
	processes.noteData("session-1", "earlier");
	const phone = new FakeConnection("phone");

	const replay = processes.attach("session-1", phone);
	await flushed();

	expect(replay).toBe("earlier");
	expect(phone.dataSeen()).toEqual([]);
});

test("any attached connection may write to the process", () => {
	register("session-1");
	processes.attach("session-1", new FakeConnection("desktop"));
	processes.attach("session-1", new FakeConnection("phone"));

	processes.write("session-1", "from desktop");
	processes.write("session-1", "from phone");

	expect(terminal.writes).toEqual(["from desktop", "from phone"]);
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
	processes.attach("session-1", desktop);
	processes.attach("session-1", phone);

	processes.detachConnection("phone");
	processes.noteData("session-1", "still running");
	await flushed();

	expect(terminal.killed).toBe(0);
	expect(processes.find(SHELL)).toBe("session-1");
	expect(desktop.dataSeen()).toEqual(["still running"]);
	expect(phone.dataSeen()).toEqual([]);
});

test("detaching the last connection leaves the process alive", () => {
	register("session-1");
	processes.attach("session-1", new FakeConnection("desktop"));

	processes.detach("session-1", "desktop");

	expect(terminal.killed).toBe(0);
	expect(processes.list()).toEqual([{ ...SHELL, sessionId: "session-1", pid: terminal.pid }]);
});

test("closing the shell kills its process and frees the shell for a fresh one", () => {
	register("session-1");

	processes.closeShell(SHELL);

	expect(terminal.killed).toBe(1);
	expect(processes.find(SHELL)).toBeUndefined();
});

test("an exit the app asked for does not read as the agent session dying on its own", () => {
	register("session-1");
	processes.close("session-1");

	expect(processes.noteExit("session-1", 0)).toBe(false);
});

test("an exit nobody asked for reports itself as spontaneous", () => {
	register("session-1");

	expect(processes.noteExit("session-1", 1)).toBe(true);
});

test("every attached connection is told the process exited", () => {
	register("session-1");
	const desktop = new FakeConnection("desktop");
	const phone = new FakeConnection("phone");
	processes.attach("session-1", desktop);
	processes.attach("session-1", phone);

	processes.noteExit("session-1", 3);

	const exit: TerminalStreamEvent = { type: "exit", payload: { sessionId: "session-1", exitCode: 3 } };
	expect(desktop.events).toEqual([exit]);
	expect(phone.events).toEqual([exit]);
});

test("output buffered when the process was closed still reaches the screen", () => {
	register("session-1");
	const desktop = new FakeConnection("desktop");
	processes.attach("session-1", desktop);
	processes.noteData("session-1", "last words");

	processes.close("session-1");

	expect(desktop.dataSeen()).toEqual(["last words"]);
});
