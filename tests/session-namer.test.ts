import { describe, expect, it } from "bun:test";
import { NAMING_MILESTONES, namingDue } from "@main/agents/naming/session-namer";
import { NAMING_SLOTS, withNamingSlot } from "@main/agents/naming/naming-slots";
import type { ContinuityShell } from "@main/store/continuity";

const [FIRST_MILESTONE, SECOND_MILESTONE] = NAMING_MILESTONES;

function shell(patch: Partial<ContinuityShell> = {}): ContinuityShell {
	return {
		id: "s1",
		label: "Shell 1",
		createdAt: 0,
		session: { harness: "claude", sessionId: "abc", cwd: "/tmp/project" },
		...patch,
	};
}

function due(input: { turns: number; attempts?: number; shell?: ContinuityShell; enabled?: boolean }): boolean {
	return namingDue({
		shell: input.shell ?? shell(),
		turns: input.turns,
		attempts: input.attempts ?? 0,
		enabled: input.enabled ?? true,
	});
}

describe("namingDue", () => {
	it("waits for the first milestone", () => {
		expect(due({ turns: FIRST_MILESTONE - 1 })).toBe(false);
		expect(due({ turns: FIRST_MILESTONE })).toBe(true);
	});

	it("waits for the next milestone once the shell has been named", () => {
		const named = shell({ namings: 1, title: "a name", titleSource: "model" });

		expect(due({ turns: SECOND_MILESTONE - 1, shell: named })).toBe(false);
		expect(due({ turns: SECOND_MILESTONE, shell: named })).toBe(true);
	});

	it("does not retry a failed attempt before the next milestone", () => {
		expect(due({ turns: FIRST_MILESTONE + 1, attempts: 1 })).toBe(false);
		expect(due({ turns: SECOND_MILESTONE, attempts: 1 })).toBe(true);
	});

	it("continues the ladder from the persisted count after a restart", () => {
		const named = shell({ namings: 1, title: "a name", titleSource: "model" });

		expect(due({ turns: FIRST_MILESTONE, shell: named })).toBe(false);
		expect(due({ turns: SECOND_MILESTONE, shell: named })).toBe(true);
	});

	it("stops naming after the last milestone", () => {
		const exhausted = shell({ namings: NAMING_MILESTONES.length });

		expect(due({ turns: Number.MAX_SAFE_INTEGER, shell: exhausted })).toBe(false);
	});

	it("never names a shell the user named by hand", () => {
		expect(due({ turns: FIRST_MILESTONE, shell: shell({ title: "psql", titleSource: "user" }) })).toBe(false);
	});

	it("never names an archived shell", () => {
		expect(due({ turns: FIRST_MILESTONE, shell: shell({ archivedAt: 1 }) })).toBe(false);
	});

	it("never names a shell with no agent session", () => {
		const { session: _session, ...plain } = shell();

		expect(due({ turns: FIRST_MILESTONE, shell: plain })).toBe(false);
	});

	it("never names a shell that is already gone", () => {
		expect(namingDue({ shell: undefined, turns: FIRST_MILESTONE, attempts: 0, enabled: true })).toBe(false);
	});

	it("names nothing while the setting is off", () => {
		expect(due({ turns: FIRST_MILESTONE, enabled: false })).toBe(false);
	});
});

describe("withNamingSlot", () => {
	it("runs no more than the slot count at once and still finishes the rest", async () => {
		const release: (() => void)[] = [];
		let live = 0;
		let peak = 0;

		const runs = Array.from({ length: NAMING_SLOTS + 2 }, (_entry, index) =>
			withNamingSlot(async () => {
				live += 1;
				peak = Math.max(peak, live);
				await new Promise<void>((resolve) => release.push(resolve));
				live -= 1;

				return index;
			}),
		);

		for (let pass = 0; pass < NAMING_SLOTS + 3; pass += 1) {
			await new Promise((resolve) => setTimeout(resolve, 0));
			for (const resolve of release.splice(0)) {
				resolve();
			}
		}

		expect(await Promise.all(runs)).toEqual(runs.map((_run, index) => index));
		expect(peak).toBe(NAMING_SLOTS);
	});
});
