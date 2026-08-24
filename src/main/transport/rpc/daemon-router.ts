import { ORPCError } from "@orpc/server";
import { ActiveWork } from "@main/agents/active-work";
import { DaemonShutdown } from "@main/daemon/daemon-shutdown";
import { base } from "@main/transport/rpc/rpc-base";
import { shellProcesses } from "@main/terminal/shell-processes";

export const daemonRouter = {
	shells: base.handler(() => [...new Set(shellProcesses.list().map((session) => session.shellId))]),
	workload: base.handler(() => ActiveWork.count()),
	stop: base.handler(({ context }) => {
		if (!context.loopback) {
			throw new ORPCError("NOT_FOUND");
		}

		setTimeout(() => {
			void DaemonShutdown.run();
		}, 0).unref();
	}),
};
