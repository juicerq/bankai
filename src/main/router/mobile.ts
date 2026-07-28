import { type } from "arktype";
import { base } from "@main/router/_base";
import { regenerateServerToken } from "@main/server/reach";
import { mobileAccess, setMobileAccess } from "@main/tailscale/mobileAccess";

export const mobileRouter = {
	getAccess: base.handler(() => mobileAccess()),
	setExposed: base
		.input(type({ enabled: "boolean" }))
		.handler(({ input }) => setMobileAccess(input.enabled)),
	regenerateToken: base.handler(async () => {
		await regenerateServerToken();

		return await mobileAccess();
	}),
};
