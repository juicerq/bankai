import { os } from "@orpc/server";
import { Logger } from "@main/logger";

export const base = os.use(async ({ next, path }) => {
	try {
		return await next();
	} catch (err) {
		Logger.error(`orpc:${path.join(".")}`, { err: String(err) });
		throw err;
	}
});
