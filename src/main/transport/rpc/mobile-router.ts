import { type } from "arktype";
import { base } from "@main/transport/rpc/rpc-base";
import { regenerateServerToken } from "@main/transport/server/server-reach";
import { mobileAccess, setMobileAccess } from "@main/infra/tailscale/mobile-access";

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
