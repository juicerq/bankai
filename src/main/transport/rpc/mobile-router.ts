import { type } from "arktype";
import { base } from "@main/transport/rpc/rpc-base";
import { Reach } from "@main/transport/server/server-reach";
import { MobileAccess } from "@main/infra/tailscale/mobile-access";

export const mobileRouter = {
	getAccess: base.handler(() => MobileAccess.read()),
	setExposed: base
		.input(type({ enabled: "boolean" }))
		.handler(({ input }) => MobileAccess.set(input.enabled)),
	regenerateToken: base.handler(async () => {
		await Reach.regenerateToken();

		return await MobileAccess.read();
	}),
};
