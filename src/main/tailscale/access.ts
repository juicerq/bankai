import { type, type Type } from "arktype";
import { Logger } from "@main/logger";
import { serverReach } from "@main/server/reach";
import { tailscale } from "@main/tailscale/run";
import { pairingUrl, SERVER_HOST } from "@shared/server";

const TAILSCALE_SERVE_PORT = 443;

export const TAILSCALE_OPERATOR_REMEDY =
	"Tailscale refused the change. Run `sudo tailscale set --operator=$USER` once in a terminal, then try again.";

const TAILSCALE_MISSING_REMEDY = "Tailscale is not answering on this machine. Start it and try again.";

const statusSchema = type({ "Self?": { "DNSName?": "string" } });

const serveStatusSchema = type({
	"Web?": { "[string]": { "Handlers?": { "[string]": { "Proxy?": "string" } } } },
});

export interface MobileAccess {
	host: string | undefined;
	url: string | undefined;
	exposed: boolean;
	problem?: string;
}

function readJson<Schema extends Type>(raw: string, schema: Schema): Schema["infer"] | undefined {
	try {
		return schema.assert(JSON.parse(raw));
	} catch {
		return undefined;
	}
}

export function magicDnsHost(raw: string): string | undefined {
	const name = readJson(raw, statusSchema)?.Self?.DNSName?.replace(/\.$/, "");

	return name || undefined;
}

export function serveProxyTarget(port: number): string {
	return `http://${SERVER_HOST}:${port}`;
}

export function serveExposes(raw: string, port: number): boolean {
	const web = readJson(raw, serveStatusSchema)?.Web;
	if (!web) {
		return false;
	}

	return Object.entries(web)
		.filter(([host]) => host.endsWith(`:${TAILSCALE_SERVE_PORT}`))
		.some(([, site]) =>
			Object.values(site.Handlers ?? {}).some((handler) => handler.Proxy === serveProxyTarget(port))
		);
}

export function serveArgs({ enabled, port }: { enabled: boolean; port: number }): string[] {
	if (!enabled) {
		return ["serve", `--https=${TAILSCALE_SERVE_PORT}`, "off"];
	}

	return ["serve", "--bg", `--https=${TAILSCALE_SERVE_PORT}`, serveProxyTarget(port)];
}

export function serveProblem(stderr: string): string {
	if (/operator|access denied/i.test(stderr)) {
		return TAILSCALE_OPERATOR_REMEDY;
	}

	return stderr.split("\n").find((line) => line.trim().length > 0)?.trim() ?? TAILSCALE_MISSING_REMEDY;
}

export async function mobileAccess(): Promise<MobileAccess> {
	const { port, token } = serverReach();
	const [status, serve] = await Promise.all([
		tailscale(["status", "--json"]),
		tailscale(["serve", "status", "--json"]),
	]);
	const host = magicDnsHost(status.stdout);

	return {
		host,
		url: host ? pairingUrl({ host, token }) : undefined,
		exposed: serveExposes(serve.stdout, port),
	};
}

export async function setMobileAccess(enabled: boolean): Promise<MobileAccess> {
	const { port } = serverReach();
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
