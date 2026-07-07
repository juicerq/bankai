import { describe, expect, it } from "vitest";
import type { HookEvent } from "@core/hooks/HookGateway";
import { ReviewModel } from "@core/review/ReviewModel";

function ev(
	event: HookEvent["event"],
	extra?: Partial<HookEvent>,
): HookEvent {
	return { event, sessionId: "s", ...extra };
}

const write = (filePath: string, content: string) =>
	ev("PostToolUse", { filePath, content });

const edit = (
	filePath: string,
	opts: { old?: string; new: string; replaceAll?: boolean },
) =>
	ev("PostToolUse", {
		filePath,
		oldString: opts.old,
		newString: opts.new,
		replaceAll: opts.replaceAll,
	});

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
			edit("/b.ts", { new: "changed" }),
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

	it("a later Write that rewrites a file keeps prior lines as context, only new ones as add", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "soma" }),
			write("/calc.ts", "soma a\nsoma b"),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "multiplica" }),
			write("/calc.ts", "soma a\nsoma b\nmult a\nmult b"),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[1]?.files[0]?.lines).toEqual([
			{ turnId: "s:0", path: "/calc.ts", line: 1, kind: "context", text: "soma a" },
			{ turnId: "s:0", path: "/calc.ts", line: 2, kind: "context", text: "soma b" },
			{ turnId: "s:1", path: "/calc.ts", line: 3, kind: "add", text: "mult a" },
			{ turnId: "s:1", path: "/calc.ts", line: 4, kind: "add", text: "mult b" },
		]);
	});

	it("reconstructs an Edit from the last known content and marks only the changed line as add", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "write" }),
			write("/a.ts", "a\nb\nc"),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "tweak" }),
			edit("/a.ts", { old: "b", new: "B" }),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[1]?.files[0]?.lines).toEqual([
			{ turnId: "s:0", path: "/a.ts", line: 1, kind: "context", text: "a" },
			{ turnId: "s:1", path: "/a.ts", line: 2, kind: "add", text: "B" },
			{ turnId: "s:0", path: "/a.ts", line: 3, kind: "context", text: "c" },
		]);
	});

	it("reconstructs pre-existing context from an Edit's old_string on an unseen file", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "p" }),
			edit("/x.ts", { old: "keep\nold", new: "keep\nnew" }),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[0]?.files[0]?.lines).toEqual([
			{ turnId: "", path: "/x.ts", line: 1, kind: "context", text: "keep" },
			{ turnId: "s:0", path: "/x.ts", line: 2, kind: "add", text: "new" },
		]);
	});

	it("falls back to all-add for a file past the diff cap", () => {
		const model = new ReviewModel();
		const base = Array.from({ length: 3001 }, (_, i) => `l${i}`).join("\n");
		feed(model, [
			ev("UserPromptSubmit", { prompt: "big" }),
			write("/big.ts", base),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "grow" }),
			write("/big.ts", `${base}\nl3001`),
			ev("Stop"),
		]);

		const lines = model.getTurns("s")[1]?.files[0]?.lines ?? [];
		expect(lines).toHaveLength(3002);
		expect(lines.every((l) => l.kind === "add" && l.turnId === "s:1")).toBe(true);
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
			ev("PostToolUse"),
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
