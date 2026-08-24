import { os } from "@orpc/server";
import { Logger } from "@main/infra/logger";

export interface RpcContext {
	loopback?: boolean;
}

export const base = os.$context<RpcContext>().use(async ({ next, path, signal }) => {
	try {
		return await next();
	} catch (err) {
		if (signal?.aborted && err === signal.reason) {
			throw err;
		}

		Logger.error(`orpc:${path.join(".")}`, { err: String(err) });
		throw err;
	}
});
