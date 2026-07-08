import { describe, expect, it } from "vitest";
import type { HookEvent } from "@core/hooks/HookGateway";
import { ReviewModel } from "@core/review/ReviewModel";

function ev(event: HookEvent["event"], extra?: Partial<HookEvent>): HookEvent {
	return { event, sessionId: "s", ...extra };
}

const write = (filePath: string, content: string) => ev("PostToolUse", { filePath, content });

const edit = (filePath: string, opts: { old?: string; new: string; replaceAll?: boolean }) =>
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
	it("assembles a turn from prompt → edits → stop with per-file snapshots", () => {
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

	it("captures a new file as an empty before and the written content as after", () => {
		const model = new ReviewModel();
		feed(model, [ev("UserPromptSubmit", { prompt: "p" }), write("/a.ts", "one\ntwo"), ev("Stop")]);

		expect(model.getTurns("s")[0]?.files[0]).toEqual({
			path: "/a.ts",
			before: [],
			after: ["one", "two"],
		});
	});

	it("carries the prior turn's content as the next turn's before", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "soma" }),
			write("/calc.ts", "soma a\nsoma b"),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "multiplica" }),
			write("/calc.ts", "soma a\nsoma b\nmult a\nmult b"),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[1]?.files[0]).toEqual({
			path: "/calc.ts",
			before: ["soma a", "soma b"],
			after: ["soma a", "soma b", "mult a", "mult b"],
		});
	});

	it("retains a purely deleted line in before so the deletion is not discarded", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "guard" }),
			write("/a.ts", "a\nguard\nc"),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "drop guard" }),
			write("/a.ts", "a\nc"),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[1]?.files[0]).toEqual({
			path: "/a.ts",
			before: ["a", "guard", "c"],
			after: ["a", "c"],
		});
	});

	it("reconstructs an Edit from the last known content", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "write" }),
			write("/a.ts", "a\nb\nc"),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "tweak" }),
			edit("/a.ts", { old: "b", new: "B" }),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[1]?.files[0]).toEqual({
			path: "/a.ts",
			before: ["a", "b", "c"],
			after: ["a", "B", "c"],
		});
	});

	it("seeds before from an Edit's old_string on an unseen file", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "p" }),
			edit("/x.ts", { old: "keep\nold", new: "keep\nnew" }),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[0]?.files[0]).toEqual({
			path: "/x.ts",
			before: ["keep", "old"],
			after: ["keep", "new"],
		});
	});

	it("captures every edit to a pre-existing file from its full-file baseline", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "edit two spots" }),
			ev("PostToolUse", {
				filePath: "/a.ts",
				originalContent: "line one\nline two\nline three",
				oldString: "line one",
				newString: "LINE ONE",
			}),
			ev("PostToolUse", {
				filePath: "/a.ts",
				originalContent: "LINE ONE\nline two\nline three",
				oldString: "line three",
				newString: "LINE THREE",
			}),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[0]?.files[0]).toEqual({
			path: "/a.ts",
			before: ["line one", "line two", "line three"],
			after: ["LINE ONE", "line two", "LINE THREE"],
		});
	});

	it("treats an edit's replacement as literal so $ sequences survive", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "price template" }),
			ev("PostToolUse", {
				filePath: "/p.ts",
				originalContent: "const a = 1",
				oldString: "const a = 1",
				newString: "const price = `$${amount}`",
			}),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[0]?.files[0]?.after).toEqual(["const price = `$${amount}`"]);
	});

	it("folds multiple edits to one file within a turn into a single before/after", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "p" }),
			write("/a.ts", "a\nb"),
			edit("/a.ts", { old: "b", new: "B" }),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[0]?.files).toEqual([
			{ path: "/a.ts", before: [], after: ["a", "B"] },
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
		expect(model.getTurns("s")[1]?.files[0]?.path).toBe("/b.ts");
	});

	it("exposes the open turn before Stop so live edits accumulate", () => {
		const model = new ReviewModel();
		feed(model, [ev("UserPromptSubmit", { prompt: "p" }), write("/a.ts", "x")]);

		expect(model.getTurns("s")).toHaveLength(1);
		expect(model.getStatus("s")).toBe("generating");
	});

	it("keeps sessions isolated by session_id", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { sessionId: "a", prompt: "pa" }),
			ev("PostToolUse", { sessionId: "a", filePath: "/a.ts", content: "x" }),
			ev("UserPromptSubmit", { sessionId: "b", prompt: "pb" }),
			ev("PostToolUse", { sessionId: "b", filePath: "/b.ts", content: "y" }),
		]);

		expect(model.getTurns("a")[0]?.turnId).toBe("a:0");
		expect(model.getTurns("b")[0]?.turnId).toBe("b:0");
	});

	it("ignores a PostToolUse with no file content", () => {
		const model = new ReviewModel();
		feed(model, [ev("UserPromptSubmit", { prompt: "p" }), ev("PostToolUse"), write("/a.ts", "x")]);

		expect(model.getTurns("s")[0]?.files.map((f) => f.path)).toEqual(["/a.ts"]);
	});

	it("drops a talk-only turn at close", () => {
		const model = new ReviewModel();
		feed(model, [ev("UserPromptSubmit", { prompt: "how does this work?" }), ev("Stop")]);

		expect(model.getTurns("s")).toEqual([]);
	});

	it("hides the open turn until the first file is touched", () => {
		const model = new ReviewModel();
		feed(model, [ev("UserPromptSubmit", { prompt: "p" })]);

		expect(model.getTurns("s")).toEqual([]);

		model.apply(write("/a.ts", "x"));

		expect(model.getTurns("s")).toHaveLength(1);
	});

	it("keeps a slash-command turn that edited files as a reviewable turn", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "/to-tasks fatia 1" }),
			write("/tasks/01.md", "task"),
			ev("Stop"),
		]);

		expect(model.getTurns("s")[0]?.prompt).toBe("/to-tasks fatia 1");
	});

	it("keeps only turns with file changes across a mixed session", () => {
		const model = new ReviewModel();
		feed(model, [
			ev("UserPromptSubmit", { prompt: "first" }),
			write("/a.ts", "x"),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "/model sonnet" }),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "second" }),
			write("/b.ts", "y"),
			ev("Stop"),
			ev("UserPromptSubmit", { prompt: "/compact" }),
			ev("Stop"),
		]);

		expect(model.getTurns("s").map((t) => t.prompt)).toEqual(["first", "second"]);
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

		model.apply(ev("Notification", { message: "Claude needs your permission to use Write" }));
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
