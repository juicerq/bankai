import { Harnesses } from "@main/agents/harness/harnesses";
import { Logger } from "@main/infra/logger";
import { NamingSlots } from "@main/agents/naming/naming-slots";
import { Continuity, type ContinuityShell } from "@main/store/continuity";
import { harnessProfile, Settings, sessionNamingEnabled } from "@main/store/settings";
import type { ShellAddress } from "@shared/continuity-reducers";

export const NAMING_MILESTONES = [3, 10, 30, 100] as const;

export function namingDue(input: {
	shell: ContinuityShell | undefined;
	turns: number;
	attempts: number;
	enabled: boolean;
}): boolean {
	const shell = input.shell;
	if (!input.enabled || !shell?.session || shell.archivedAt !== undefined || shell.titleSource === "user") {
		return false;
	}

	const threshold = NAMING_MILESTONES.at(Math.max(input.attempts, shell.namings ?? 0));

	return threshold !== undefined && input.turns >= threshold;
}

class SessionNamerRunner {
	private readonly turns = new Map<string, number>();
	private readonly attempts = new Map<string, number>();
	private readonly running = new Set<string>();

	noteTurn(owner: ShellAddress): void {
		const turns = (this.turns.get(owner.shellId) ?? 0) + 1;
		this.turns.set(owner.shellId, turns);

		const soonest = NAMING_MILESTONES.at(this.attempts.get(owner.shellId) ?? 0);
		if (soonest === undefined || turns < soonest || this.running.has(owner.shellId)) {
			return;
		}

		this.name(owner).catch((err) => Logger.error("naming:crashed", { ...owner, err: String(err) }));
	}

	forget(liveShellIds: ReadonlySet<string>): void {
		for (const shellId of this.turns.keys()) {
			if (!liveShellIds.has(shellId)) {
				this.turns.delete(shellId);
				this.attempts.delete(shellId);
			}
		}
	}

	private async name(owner: ShellAddress): Promise<void> {
		this.running.add(owner.shellId);

		try {
			await this.propose(owner);
		} finally {
			this.running.delete(owner.shellId);
		}
	}

	private async propose(owner: ShellAddress): Promise<void> {
		const shell = await Continuity.findShell(owner);
		const session = shell?.session;
		if (!session) {
			return;
		}

		const due = namingDue({
			shell,
			turns: this.turns.get(owner.shellId) ?? 0,
			attempts: this.attempts.get(owner.shellId) ?? 0,
			enabled: sessionNamingEnabled(harnessProfile((await Settings.get()).harness, session.harness)),
		});
		if (!due) {
			return;
		}

		const propose = Harnesses.proposeName(session.harness);
		if (!propose) {
			return;
		}

		this.attempts.set(owner.shellId, (this.attempts.get(owner.shellId) ?? 0) + 1);

		const title = await NamingSlots.withSlot(() => propose(session)).catch((err) => {
			Logger.warn("naming:failed", { ...owner, err: String(err) });

			return null;
		});
		if (!title) {
			return;
		}

		await Continuity.nameShell({ ...owner, title, source: "model" });
	}
}

export const SessionNamer = new SessionNamerRunner();
