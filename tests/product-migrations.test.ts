import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewState } from "@core/store/review-state";
import { migrateWorkspaceV1, WorkspaceStore } from "@core/store/workspace";
import { assertDefined } from "./utils/assertions";

function fixture(name: string, value: unknown): void {
	assertDefined(process.env.DATA_DIR);
	writeFileSync(join(process.env.DATA_DIR, `${name}.json`), JSON.stringify(value));
}

describe("product migrations", () => {
	it("qualifies Workspace Sessions from the real v1 envelope", async () => {
		const legacy = {
			projects: [{
				projectId: "p",
				tabs: [{ command: { sessionId: "native", argv: ["claude"] } }],
				activeTab: 0,
			}],
			focusedProjectId: "p",
			focus: "terminal",
			zen: { command: false, review: true },
			screen: "review",
			reviewSessionId: "native",
		} as const;

		expect(migrateWorkspaceV1(legacy).projects).toHaveLength(1);
		fixture("workspace", { version: 1, data: legacy });
		const value = await WorkspaceStore.read();

		expect(value.projects[0]?.tabs[0]).toEqual({
			state: "bound",
			session: { harness: "claude", sessionId: "native" },
			running: { argv: ["claude"], kind: "interactive" },
		});
		expect(value.reviewSession).toEqual({ harness: "claude", sessionId: "native" });
	});

	it("qualifies reviewed state from its real v1 envelope", async () => {
		fixture("reviewState", { version: 1, data: { native: ["native:0"] } });
		const session = { harness: "claude" as const, sessionId: "native" };

		expect(await ReviewState.get(session)).toEqual(["native:0"]);
	});
});
