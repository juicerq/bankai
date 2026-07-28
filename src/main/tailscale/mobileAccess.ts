import { Logger } from "@main/logger";
import { serverReach } from "@main/server/reach";
import { closeTailnetListener, openTailnetListener, tailnetListenerAddress } from "@main/server/tailnet";
import { Settings } from "@main/store/settings";
import {
	magicDnsHost,
	type MobileAccess,
	serveArgs,
	serveExposes,
	serveProblem,
	TAILSCALE_MISSING_REMEDY,
	tailnetAddress,
	tailnetIssuesCertificates,
} from "@main/tailscale/access";
import { tailscale } from "@main/tailscale/run";
import { pairingUrl } from "@shared/server";

export async function mobileAccess(): Promise<MobileAccess> {
	const { port, token } = serverReach();
	const [status, serve] = await Promise.all([
		tailscale(["status", "--json"]),
		tailscale(["serve", "status", "--json"]),
	]);
	const host = magicDnsHost(status.stdout);
	const address = tailnetAddress(status.stdout);

	return {
		host,
		url: host ? pairingUrl({ origin: `https://${host}`, token }) : undefined,
		exposed: serveExposes(serve.stdout, port),
		tailnetUrl: address ? pairingUrl({ origin: `http://${address}:${port}`, token }) : undefined,
		tailnetOpen: !!tailnetListenerAddress(),
	};
}

export async function restoreTailnetAccess(): Promise<void> {
	if (!(await Settings.tailnetAccess())) {
		return;
	}

	const status = await tailscale(["status", "--json"]);
	const address = tailnetAddress(status.stdout);

	if (!address) {
		Logger.warn("tailscale:tailnet-address-missing");

		return;
	}

	await openTailnetListener(address);
}

async function serve(enabled: boolean): Promise<MobileAccess> {
	const result = await tailscale(serveArgs({ enabled, port: serverReach().port }));

	if (result.failed) {
		Logger.warn("tailscale:serve-failed", { enabled, err: result.stderr });
	}

	const access = await mobileAccess();
	if (access.exposed === enabled) {
		return access;
	}

	return { ...access, problem: serveProblem(result.stderr) };
}

export async function setMobileAccess(enabled: boolean): Promise<MobileAccess> {
	if (!enabled) {
		await closeTailnetListener();
		await Settings.setTailnetAccess(false);

		const closed = await mobileAccess();

		if (!closed.exposed) {
			return closed;
		}

		return await serve(false);
	}

	const status = await tailscale(["status", "--json"]);

	if (tailnetIssuesCertificates(status.stdout)) {
		return await serve(true);
	}

	const address = tailnetAddress(status.stdout);

	if (!address) {
		return { ...(await mobileAccess()), problem: TAILSCALE_MISSING_REMEDY };
	}

	await openTailnetListener(address);
	await Settings.setTailnetAccess(true);

	return await mobileAccess();
}
