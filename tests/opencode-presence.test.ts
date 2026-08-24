import { describe, expect, test } from "bun:test";
import { interactiveInvocation, opencodePresence } from "@main/agents/harness/opencode/opencode-harness";

describe("an opencode command line bankai reads", () => {
	test("the plain tui is interactive", () => {
		expect(interactiveInvocation(["opencode"]).interactive).toBe(true);
	});

	test("the tui opened on a project path is interactive", () => {
		expect(interactiveInvocation(["opencode", "/home/jui/projects/bankai"]).interactive).toBe(true);
		expect(interactiveInvocation(["opencode", "."]).interactive).toBe(true);
	});

	test("subcommands are ordinary processes", () => {
		for (const command of ["run", "serve", "attach", "acp", "mcp", "web", "export", "upgrade", "models"]) {
			expect(interactiveInvocation(["opencode", command]).interactive).toBe(false);
			expect(interactiveInvocation(["opencode", command, "extra"]).interactive).toBe(false);
		}
	});

	test("the resumed session rides along in the invocation", () => {
		expect(interactiveInvocation(["opencode", "--session", "ses_abc123"]).sessionId).toBe("ses_abc123");
		expect(interactiveInvocation(["opencode", "-s", "ses_abc123"]).sessionId).toBe("ses_abc123");
		expect(interactiveInvocation(["opencode", "--session=ses_abc123"]).sessionId).toBe("ses_abc123");
		expect(interactiveInvocation(["opencode", "-sses_abc123"]).sessionId).toBe("ses_abc123");
	});

	test("flags around the project path do not hide the session", () => {
		const parsed = interactiveInvocation(["opencode", "--model", "gpt-5.6", "--session", "ses_abc", "/repo"]);
		expect(parsed.interactive).toBe(true);
		expect(parsed.sessionId).toBe("ses_abc");
	});

	test("a missing command line is not an invocation", () => {
		expect(interactiveInvocation(null).interactive).toBe(false);
	});
});

describe("an opencode process bankai discovers", () => {
	const PID = 4242;
	const PROC_START = "12345";
	const CWD = "/home/jui/projects/bankai";

	function presence(session?: { id: string; cwd: string; turn: { open: boolean; startedAt?: number; endedAt?: number }; questionSince?: number }) {
		return opencodePresence({
			pid: PID,
			argv: ["opencode"],
			procStart: PROC_START,
			cwd: CWD,
			...(session && {
				session: {
					sessionId: session.id,
					cwd: session.cwd,
					turn: session.turn,
					...(session.questionSince !== undefined && { questionSince: session.questionSince }),
				},
			}),
		});
	}

	test("an interactive tui with no session yet sits idle in its own directory", () => {
		expect(presence()).toEqual({
			harness: "opencode",
			pid: PID,
			procStart: PROC_START,
			cwd: CWD,
			status: "idle",
		});
	});

	test("an open turn is working since the turn started", () => {
		expect(presence({ id: "ses_1", cwd: CWD, turn: { open: true, startedAt: 500 } })).toEqual({
			harness: "opencode",
			sessionId: "ses_1",
			pid: PID,
			procStart: PROC_START,
			cwd: CWD,
			status: "working",
			statusSince: 500,
		});
	});

	test("a pending question outranks the open turn and waits since the question", () => {
		const found = presence({
			id: "ses_1",
			cwd: CWD,
			turn: { open: true, startedAt: 500 },
			questionSince: 900,
		});

		expect(found?.status).toBe("waiting");
		expect(found?.statusSince).toBe(900);
	});

	test("a closed turn is idle since it ended", () => {
		expect(presence({ id: "ses_1", cwd: CWD, turn: { open: false, endedAt: 800 } })).toEqual({
			harness: "opencode",
			sessionId: "ses_1",
			pid: PID,
			procStart: PROC_START,
			cwd: CWD,
			status: "idle",
			statusSince: 800,
		});
	});

	test("a bound session reports the directory the session lives in", () => {
		const found = presence({ id: "ses_1", cwd: "/elsewhere", turn: { open: false } });
		expect(found?.cwd).toBe("/elsewhere");
	});

	test("headless and vanished processes are not agents", () => {
		expect(opencodePresence({ pid: PID, argv: ["opencode", "run", "hi"], procStart: PROC_START, cwd: CWD })).toBeNull();
		expect(opencodePresence({ pid: PID, argv: ["opencode"], procStart: null, cwd: CWD })).toBeNull();
		expect(opencodePresence({ pid: PID, argv: ["opencode"], procStart: PROC_START, cwd: null })).toBeNull();
	});
});
