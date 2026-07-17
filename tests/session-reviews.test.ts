import { describe, expect, it } from "vitest";
import { SessionReviews } from "@core/session/SessionReviews";
import { TabSupervisor } from "@core/terminal/TabSupervisor";

const session = { harness: "claude" as const, sessionId: "session" };
const turn = {
	turnId: "session:0",
	prompt: "change it",
	files: [{ path: "src/a.ts", before: ["old"], after: ["new"] }],
	state: "completed" as const,
};

describe("SessionReviews", () => {
	it("derives tab status and owns the reviewed transition", async () => {
		const supervisor = new TabSupervisor();
		const reviews = new SessionReviews(
			supervisor,
			{
				tab: {
					state: "bound",
					session,
				},
			},
			{
				session,
				turns: [turn],
				reviewed: [],
				available: true,
			},
		);
		let notifications = 0;
		const unsubscribe = reviews.subscribe(() => notifications++);

		expect(reviews.tabStatuses(["tab"])).toEqual({
			tab: { status: "idle", unreviewed: true },
		});
		await reviews.toggle(session, turn.turnId);

		expect(reviews.presentation(session).reviewedTurnIds).toEqual([turn.turnId]);
		expect(reviews.tabStatuses(["tab"]).tab?.unreviewed).toBe(false);
		expect(notifications).toBe(1);

		unsubscribe();
		reviews.dispose();
		supervisor.disposeAll();
	});

	it("does not review active work", async () => {
		const supervisor = new TabSupervisor();
		const reviews = new SessionReviews(supervisor, {}, {
			session,
			turns: [{ ...turn, state: "active" }],
			reviewed: [],
			available: true,
		});

		await reviews.toggle(session, turn.turnId);

		expect(reviews.presentation(session).reviewedTurnIds).toEqual([]);
		reviews.dispose();
		supervisor.disposeAll();
	});

	it("publishes capture removal after a poll", async () => {
		const supervisor = new TabSupervisor();
		const reviews = new SessionReviews(supervisor, {
			missing: { state: "bound", session },
		}, null);
		let notifications = 0;
		reviews.subscribe(() => notifications++);

		await reviews.poll();

		expect(reviews.snapshot().captures).toEqual({});
		expect(notifications).toBe(1);
		reviews.dispose();
		supervisor.disposeAll();
	});

	it("can restart its polling lifecycle", () => {
		const supervisor = new TabSupervisor();
		const reviews = new SessionReviews(supervisor, {}, null);

		const stopFirst = reviews.start();
		stopFirst();
		const stopSecond = reviews.start();
		stopSecond();

		reviews.dispose();
		supervisor.disposeAll();
	});
});
