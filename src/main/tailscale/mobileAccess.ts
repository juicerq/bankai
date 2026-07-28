import { Logger } from "@main/logger";
import { serverReach } from "@main/server/reach";
import { closeTailnetListener, openTailnetListener, tailnetListenerAddress } from "@main/server/tailnet";
import { Settings } from "@main/store/settings";
import {
	httpsProblem,
	magicDnsHost,
	type MobileAccess,
	serveArgs,
	serveExposes,
	serveProblem,
	TAILSCALE_MISSING_REMEDY,
	tailnetAddress,
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
	const access = {
		host,
		url: host ? pairingUrl({ origin: `https://${host}`, token }) : undefined,
		exposed: serveExposes(serve.stdout, port),
		tailnetUrl: address ? pairingUrl({ origin: `http://${address}:${port}`, token }) : undefined,
		tailnetOpen: !!tailnetListenerAddress(),
	};
	const problem = httpsProblem(status.stdout);

	if (!problem) {
		return access;
	}

	return { ...access, problem };
}

async function currentTailnetAddress(): Promise<string | undefined> {
	const status = await tailscale(["status", "--json"]);

	return tailnetAddress(status.stdout);
}

export async function setTailnetAccess(open: boolean): Promise<MobileAccess> {
	if (!open) {
		await closeTailnetListener();
		await Settings.setTailnetAccess(false);

		return await mobileAccess();
	}

	const address = await currentTailnetAddress();

	if (!address) {
		return { ...(await mobileAccess()), problem: TAILSCALE_MISSING_REMEDY };
	}

	await openTailnetListener(address);
	await Settings.setTailnetAccess(true);

	return await mobileAccess();
}

export async function restoreTailnetAccess(): Promise<void> {
	if (!(await Settings.tailnetAccess())) {
		return;
	}

	const address = await currentTailnetAddress();

	if (!address) {
		Logger.warn("tailscale:tailnet-address-missing");

		return;
	}

	await openTailnetListener(address);
}

export async function setMobileAccess(enabled: boolean): Promise<MobileAccess> {
	const { port } = serverReach();
	if (enabled) {
		const current = await mobileAccess();

		if (current.problem) {
			return current;
		}
	}

	const result = await tailscale(serveArgs({ enabled, port }));

	if (result.failed) {
		Logger.warn("tailscale:serve-failed", { enabled, err: result.stderr });
	}

	const access = await mobileAccess();
	if (access.exposed === enabled) {
		return access;
	}

	return { ...access, problem: serveProblem(result.stderr) };
}
