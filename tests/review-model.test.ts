import { describe, expect, it } from "vitest";
import { ReviewModel } from "@core/review/ReviewModel";

describe("ReviewModel", () => {
	it("materializes only changed interactions and completes their lifecycle", () => {
		const model = new ReviewModel("s");
		model.apply({ type: "prompt", prompt: "explain" });
		model.apply({ type: "complete" });
		model.apply({ type: "prompt", prompt: "change" });
		model.apply({ type: "change", path: "/a.ts", before: "old", after: "new" });
		expect(model.getTurns()).toEqual([{
			turnId: "s:0",
			prompt: "change",
			files: [{ path: "/a.ts", before: ["old"], after: ["new"] }],
			state: "active",
		}]);
		model.apply({ type: "complete" });
		expect(model.getTurns()[0]?.state).toBe("completed");
	});

	it("folds repeated changes and carries the confirmed file state across Turns", () => {
		const model = new ReviewModel("s");
		model.apply({ type: "prompt", prompt: "first" });
		model.apply({ type: "change", path: "/a.ts", before: "a", after: "b" });
		model.apply({ type: "change", path: "/a.ts", before: "b", after: "c" });
		model.apply({ type: "complete" });
		model.apply({ type: "prompt", prompt: "second" });
		model.apply({ type: "change", path: "/a.ts", before: "c", after: "d" });
		expect(model.getTurns().map((turn) => turn.files[0])).toEqual([
			{ path: "/a.ts", before: ["a"], after: ["c"] },
			{ path: "/a.ts", before: ["c"], after: ["d"] },
		]);
	});

	it("confirms visible work as interrupted when its process disappears", () => {
		const model = new ReviewModel("s");
		model.apply({ type: "prompt", prompt: "change" });
		model.apply({ type: "change", path: "/a.ts", before: "", after: "new" });
		model.interrupt();
		expect(model.getTurns()[0]?.state).toBe("interrupted");
		expect(model.hasOpenWork()).toBe(false);
	});

	it("keeps discontinuous structured changes separate", () => {
		const model = new ReviewModel("s");
		model.apply({ type: "prompt", prompt: "change" });
		model.apply({ type: "change", path: "/a", before: "a", after: "b" });
		model.apply({ type: "change", path: "/a", before: "external", after: "c" });
		expect(model.getTurns()[0]?.files).toEqual([
			{ path: "/a", before: ["a"], after: ["b"] },
			{ path: "/a", before: ["external"], after: ["c"] },
		]);
	});

	it("represents an empty or deleted file with no lines", () => {
		const model = new ReviewModel("s");
		model.apply({ type: "change", path: "/a", before: "old", after: "" });
		expect(model.getTurns()[0]?.files[0]?.after).toEqual([]);
	});
});
