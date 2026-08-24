import { AgentActivity } from "@main/agents/agent-activity";
import { DaemonProbes } from "@main/daemon/daemon-probes";
import { DaemonShutdown } from "@main/daemon/daemon-shutdown";
import { Logger } from "@main/infra/logger";
import { shellProcesses } from "@main/terminal/shell-processes";
import { LiveConnections } from "@main/transport/server/live-connections";

export const DAEMON_IDLE_GRACE_MS = 60_000;

const DAEMON_IDLE_CHECK_MS = 30_000;

const DAEMON_IDLE_SETTLE_MS = 1_000;

export class DaemonIdle {
	private idleSince: number | undefined;
	private timer: NodeJS.Timeout | undefined;

	expired(now: number): boolean {
		if (this.attended(now)) {
			this.idleSince = undefined;

			return false;
		}

		this.idleSince ??= now;

		return now - this.idleSince >= DAEMON_IDLE_GRACE_MS;
	}

	watch(): void {
		this.timer = setInterval(() => {
			if (!this.expired(Date.now())) {
				return;
			}

			clearInterval(this.timer);
			setTimeout(() => this.stopIfStillIdle(), DAEMON_IDLE_SETTLE_MS).unref();
		}, DAEMON_IDLE_CHECK_MS);

		this.timer.unref();
	}

	stopIfStillIdle(): void {
		if (!this.expired(Date.now())) {
			this.watch();

			return;
		}

		Logger.info("daemon:idle-shutdown", { pid: process.pid, graceMs: DAEMON_IDLE_GRACE_MS });
		void DaemonShutdown.run();
	}

	private attended(now: number): boolean {
		return LiveConnections.count() > 0
			|| now - DaemonProbes.lastAt() < DAEMON_IDLE_GRACE_MS
			|| this.working() > 0;
	}

	private working(): number {
		const shells = shellProcesses.list();

		if (process.platform !== "linux") {
			return shells.length;
		}

		return AgentActivity.countWorking(new Set(shells.map((shell) => shell.projectId)));
	}
}
