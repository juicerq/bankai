import { os } from "@orpc/server";
import { Logger } from "@main/infra/logger";

export const base = os.use(async ({ next, path, signal }) => {
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
