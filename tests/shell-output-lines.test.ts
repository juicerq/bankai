import { describe, expect, test } from "bun:test";
import { forgetShellOutput, noteShellOutput, outputLine, shellOutputLines } from "@main/terminal/ShellOutputLines";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

describe("reading one line out of a raw PTY segment", () => {
	test("plain text survives", () => {
		expect(outputLine("All 42 tests passed")).toBe("All 42 tests passed");
	});

	test("colour and cursor sequences are stripped", () => {
		expect(outputLine(`${ESC}[32m${ESC}[1mAll 42 tests passed${ESC}[0m${ESC}[K`)).toBe("All 42 tests passed");
	});

	test("a window title sequence is not output", () => {
		expect(outputLine(`${ESC}]0;bankai-2: bun run dev${BEL}`)).toBeNull();
	});

	test("whitespace collapses and the line is capped", () => {
		const line = outputLine(`   Editing    ${"x".repeat(400)}   `);

		expect(line?.startsWith("Editing x")).toBe(true);
		expect(line).toHaveLength(160);
	});

	test("a rule of box drawing carries no information", () => {
		expect(outputLine("──────────────")).toBeNull();
	});

	test("an empty segment yields nothing", () => {
		expect(outputLine(`${ESC}[2K`)).toBeNull();
	});
});

describe("tracking the latest line per shell", () => {
	test("the last readable line of a chunk wins", () => {
		noteShellOutput("s1", "first line\nsecond line\n");

		expect(shellOutputLines.get("s1")).toBe("second line");
		forgetShellOutput("s1");
	});

	test("a partial line waits for its newline", () => {
		noteShellOutput("s2", "done\nhalf of ");

		expect(shellOutputLines.get("s2")).toBe("done");

		noteShellOutput("s2", "a line\n");

		expect(shellOutputLines.get("s2")).toBe("half of a line");
		forgetShellOutput("s2");
	});

	test("a spinner redrawn with carriage returns reports its latest frame", () => {
		noteShellOutput("s3", "\rWorking 1s\rWorking 2s\r");

		expect(shellOutputLines.get("s3")).toBe("Working 2s");
		forgetShellOutput("s3");
	});

	test("a chunk of pure escapes leaves the previous line standing", () => {
		noteShellOutput("s4", "Running bun run check\n");
		noteShellOutput("s4", `${ESC}[2J${ESC}[H\n`);

		expect(shellOutputLines.get("s4")).toBe("Running bun run check");
		forgetShellOutput("s4");
	});

	test("forgetting a shell drops its line", () => {
		noteShellOutput("s5", "anything\n");
		forgetShellOutput("s5");

		expect(shellOutputLines.get("s5")).toBeUndefined();
	});
});
