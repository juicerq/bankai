import { type, type Type } from "arktype";
import { SERVER_HOST } from "@shared/server";

const TAILSCALE_SERVE_PORT = 443;

const TAILSCALE_OPERATOR_REMEDY =
	"Tailscale refused the change. Run `sudo tailscale set --operator=$USER` once in a terminal, then try again.";

const TAILSCALE_MISSING_REMEDY = "Tailscale is not answering on this machine. Start it and try again.";

const TAILSCALE_HTTPS_CAPABILITY = "https";

const statusSchema = type({
	"Self?": { "DNSName?": "string", "CapMap?": { "[string]": "unknown" }, "TailscaleIPs?": "string[]" },
});

const serveStatusSchema = type({
	"Web?": { "[string]": { "Handlers?": { "[string]": { "Proxy?": "string" } } } },
});

export interface MobileAccessStatus {
	host: string | undefined;
	url: string | undefined;
	exposed: boolean;
	tailnetUrl: string | undefined;
	tailnetOpen: boolean;
	problem?: string;
}

function readJson<Schema extends Type>(raw: string, schema: Schema): Schema["infer"] | undefined {
	try {
		return schema.assert(JSON.parse(raw));
	} catch {
		return undefined;
	}
}

function statusSelf(raw: string) {
	return readJson(raw, statusSchema)?.Self;
}

function magicDnsHost(raw: string): string | undefined {
	const name = statusSelf(raw)?.DNSName?.replace(/\.$/, "");

	return name || undefined;
}

function tailnetAddress(raw: string): string | undefined {
	return statusSelf(raw)?.TailscaleIPs?.find((address) => !address.includes(":"));
}

function tailnetIssuesCertificates(raw: string): boolean {
	const self = statusSelf(raw);
	if (!self?.DNSName) {
		return true;
	}

	return !!self.CapMap && TAILSCALE_HTTPS_CAPABILITY in self.CapMap;
}

function serveProxyTarget(port: number): string {
	const renderer = process.env.ELECTRON_RENDERER_URL;
	if (renderer) {
		return new URL(renderer).origin;
	}

	return `http://${SERVER_HOST}:${port}`;
}

function serveExposes(raw: string, port: number): boolean {
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

function serveArgs({ enabled, port }: { enabled: boolean; port: number }): string[] {
	if (!enabled) {
		return ["serve", `--https=${TAILSCALE_SERVE_PORT}`, "off"];
	}

	return ["serve", "--bg", `--https=${TAILSCALE_SERVE_PORT}`, serveProxyTarget(port)];
}

function serveProblem(stderr: string): string {
	if (/operator|access denied/i.test(stderr)) {
		return TAILSCALE_OPERATOR_REMEDY;
	}

	return stderr.split("\n").find((line) => line.trim().length > 0)?.trim() ?? TAILSCALE_MISSING_REMEDY;
}

export const TailscaleAccess = {
	TAILSCALE_OPERATOR_REMEDY,
	TAILSCALE_MISSING_REMEDY,
	magicDns: magicDnsHost,
	address: tailnetAddress,
	issuesCertificates: tailnetIssuesCertificates,
	proxyTarget: serveProxyTarget,
	exposes: serveExposes,
	serveArgs,
	problem: serveProblem,
};
