import { app } from "electron";
import { AgentActivity } from "@main/agents/agent-activity";
import { ClaudeHooks } from "@main/agents/harness/claude/claude-hooks";
import { DaemonShutdown } from "@main/daemon/daemon-shutdown";
import { APP_VERSION } from "@main/infra/app-version";
import { Logger } from "@main/infra/logger";
import { MobileAccess } from "@main/infra/tailscale/mobile-access";
import { Services } from "@main/services";
import { BankaiServer } from "@main/transport/server/bankai-server";
import { DAEMON_PROTOCOL_VERSION } from "@shared/daemon";

function portTaken(err: unknown): boolean {
	return err instanceof Error && "code" in err && err.code === "EADDRINUSE";
}

async function startDaemon(): Promise<void> {
	app.disableHardwareAcceleration();

	await app.whenReady();

	try {
		const reach = await BankaiServer.startLoopback();

		Logger.info("daemon:listening", {
			pid: process.pid,
			port: reach.port,
			appVersion: APP_VERSION,
			protocolVersion: DAEMON_PROTOCOL_VERSION,
		});
	} catch (err) {
		if (portTaken(err)) {
			Logger.info("daemon:already-running", { pid: process.pid });
			app.exit(0);

			return;
		}

		Logger.error("daemon:listen-failed", { err: String(err) });
		app.exit(1);

		return;
	}

	process.on("SIGTERM", () => {
		void DaemonShutdown.run();
	});
	process.on("SIGINT", () => {
		void DaemonShutdown.run();
	});

	MobileAccess.restore().catch((err) => {
		Logger.warn("tailscale:tailnet-restore-failed", { err: String(err) });
	});

	AgentActivity.start();

	ClaudeHooks.removeInstalled().catch((err) => {
		Logger.warn("hooks:removal-failed", { err: String(err) });
	});

	Services.autostart().catch((err) => Logger.error("services:autostart-failed", { err: String(err) }));
}

export const DaemonMain = {
	start: startDaemon,
};
