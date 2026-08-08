import { Logger } from "@main/infra/logger";
import { Reach } from "@main/transport/server/server-reach";
import { TailnetListener } from "@main/transport/server/tailnet-listener";
import { ServerSettings } from "@main/settings/server-settings";
import { TailscaleAccess } from "@main/infra/tailscale/tailscale-access";
import { Tailscale } from "@main/infra/tailscale/tailscale-run";
import type { MobileAccessStatus } from "@shared/mobile-access";
import { pairingUrl } from "@shared/server";

async function mobileAccess(): Promise<MobileAccessStatus> {
	const { port, token } = Reach.current();
	const [status, serve] = await Promise.all([
		Tailscale.run(["status", "--json"]),
		Tailscale.run(["serve", "status", "--json"]),
	]);
	const host = TailscaleAccess.magicDns(status.stdout);
	const address = TailscaleAccess.address(status.stdout);

	return {
		host,
		url: host ? pairingUrl({ origin: `https://${host}`, token }) : undefined,
		exposed: TailscaleAccess.exposes(serve.stdout, port),
		tailnetUrl: address ? pairingUrl({ origin: `http://${address}:${port}`, token }) : undefined,
		tailnetOpen: !!TailnetListener.address(),
	};
}

async function restoreTailnetAccess(): Promise<void> {
	if (!(await ServerSettings.tailnetAccess())) {
		return;
	}

	const status = await Tailscale.run(["status", "--json"]);
	const address = TailscaleAccess.address(status.stdout);

	if (!address) {
		Logger.warn("tailscale:tailnet-address-missing");

		return;
	}

	await TailnetListener.open(address);
}

async function serve(enabled: boolean): Promise<MobileAccessStatus> {
	const result = await Tailscale.run(TailscaleAccess.serveArgs({ enabled, port: Reach.current().port }));

	if (result.failed) {
		Logger.warn("tailscale:serve-failed", { enabled, err: result.stderr });
	}

	const access = await mobileAccess();
	if (access.exposed === enabled) {
		return access;
	}

	return { ...access, problem: TailscaleAccess.problem(result.stderr) };
}

async function setMobileAccess(enabled: boolean): Promise<MobileAccessStatus> {
	if (!enabled) {
		await TailnetListener.close();
		await ServerSettings.setTailnetAccess(false);

		const closed = await mobileAccess();

		if (!closed.exposed) {
			return closed;
		}

		return await serve(false);
	}

	const status = await Tailscale.run(["status", "--json"]);

	if (TailscaleAccess.issuesCertificates(status.stdout)) {
		return await serve(true);
	}

	const address = TailscaleAccess.address(status.stdout);

	if (!address) {
		return { ...(await mobileAccess()), problem: TailscaleAccess.TAILSCALE_MISSING_REMEDY };
	}

	await TailnetListener.open(address);
	await ServerSettings.setTailnetAccess(true);

	return await mobileAccess();
}

export const MobileAccess = {
	read: mobileAccess,
	restore: restoreTailnetAccess,
	set: setMobileAccess,
};
