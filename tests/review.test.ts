import { describe, expect, it } from "vitest";
import type { HookEvent } from "@main/hooks/HookGateway";
import { ReviewModel } from "@main/review/ReviewModel";

function ev(
	event: HookEvent["event"],
	extra?: Partial<HookEvent>,
): HookEvent {
	return { event, sessionId: "s", raw: null, ...extra };
}

const write = (filePath: string, content: string) =>
	ev("PostToolUse", { toolName: "Write", filePath, content });

const edit = (filePath: string, newString: string) =>
	ev("PostToolUse", { toolName: "Edit", filePath, content: newString });

function feed(model: ReviewModel, events: HookEvent[]) {
	for (const event of events) {
		model.apply(event);
	}
}

describe("ReviewModel", () => {
	it("assembles a turn from prompt → edits → stop with per-file diffs", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "add a and b" }),
			write("/a.ts", "one\ntwo"),
			edit("/b.ts", "changed"),
			ev("Stop"),
		]);

		const turns = model.getTurns("s");
		expect(turns).toHaveLength(1);
		expect(turns[0]?.turnId).toBe("s:0");
		expect(turns[0]?.prompt).toBe("add a and b");
		expect(turns[0]?.files.map((f) => f.path)).toEqual(["/a.ts", "/b.ts"]);
	});

	it("addresses each diff line by {turnId, path, line}", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "p" }),
			write("/a.ts", "one\ntwo"),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[0]?.files[0]?.lines).toEqual([
			{ turnId: "s:0", path: "/a.ts", line: 1, kind: "add", text: "one" },
			{ turnId: "s:0", path: "/a.ts", line: 2, kind: "add", text: "two" },
		]);
	});

	it("groups repeated edits to the same file into one file diff", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "p" }),
			edit("/a.ts", "first"),
			edit("/a.ts", "second"),
			ev("Stop"),
		]);

		const file = model.getTurns("s")[0]?.files;
		expect(file).toHaveLength(1);
		expect(file?.[0]?.lines.map((l) => [l.line, l.text])).toEqual([
			[1, "first"],
			[2, "second"],
		]);
	});

	it("numbers turns per session across a prompt/stop cycle", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "first" }),
			write("/a.ts", "x"),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "second" }),
			write("/b.ts", "y"),
			ev("Stop"),
		]);

		expect(model.getTurns("s").map((t) => t.turnId)).toEqual(["s:0", "s:1"]);
		expect(model.getTurns("s")[1]?.files[0]?.lines[0]?.turnId).toBe("s:1");
	});

	it("exposes the open turn before Stop so live edits accumulate", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "p" }),
			write("/a.ts", "x"),
		]);

		expect(model.getTurns("s")).toHaveLength(1);
		expect(model.getStatus("s")).toBe("generating");
	});

	it("keeps sessions isolated by session_id", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { sessionId: "a", prompt: "pa" }),
			ev("UserPromptSubmit", { sessionId: "b", prompt: "pb" }),
		]);

		expect(model.getTurns("a")[0]?.turnId).toBe("a:0");
		expect(model.getTurns("b")[0]?.turnId).toBe("b:0");
	});

	it("ignores a PostToolUse with no file content", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "p" }),
			ev("PostToolUse", { toolName: "Bash" }),
		]);

		expect(model.getTurns("s")[0]?.files).toEqual([]);
	});

	it("derives status: generating on prompt, idle on stop", () => {
		const model = new ReviewModel();
		model.apply(ev("UserPromptSubmit", { prompt: "p" }));
		expect(model.getStatus("s")).toBe("generating");
		model.apply(ev("Stop"));
		expect(model.getStatus("s")).toBe("idle");
	});

	it("flips to blocked only on a permission notification", () => {
		const model = new ReviewModel();
		model.apply(ev("UserPromptSubmit", { prompt: "p" }));

		model.apply(ev("Notification", { message: "Claude is waiting for input" }));
		expect(model.getStatus("s")).toBe("generating");

		model.apply(
			ev("Notification", { message: "Claude needs your permission to use Write" }),
		);
		expect(model.getStatus("s")).toBe("blocked");
	});

	it("notifies subscribers as events arrive and stops after unsubscribe", () => {
		const model = new ReviewModel();
		const seen: string[] = [];
		const off = model.onChange((sessionId) => seen.push(sessionId));

		model.apply(ev("UserPromptSubmit", { sessionId: "a", prompt: "p" }));
		off();
		model.apply(ev("Stop", { sessionId: "a" }));

		expect(seen).toEqual(["a"]);
	});

	it("returns no turns for an unknown session", () => {
		expect(new ReviewModel().getTurns("nope")).toEqual([]);
		expect(new ReviewModel().getStatus("nope")).toBe("idle");
	});
});
