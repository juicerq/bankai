import { describe, expect, it } from "bun:test";
import {
	magicDnsHost,
	serveArgs,
	serveExposes,
	serveProblem,
	serveProxyTarget,
	tailnetAddress,
	tailnetIssuesCertificates,
	TAILSCALE_OPERATOR_REMEDY,
} from "@main/infra/tailscale/tailscale-access";
import { SERVER_DEFAULT_PORT } from "@shared/server";

const OPERATOR_DENIAL = [
	"sending serve config: Access denied: serve config denied",
	"",
	"Use 'sudo tailscale serve --bg --https=443 http://127.0.0.1:4696'.",
	"To not require root, use 'sudo tailscale set --operator=$USER' once.",
].join("\n");

function serveStatus(port: number): string {
	return JSON.stringify({
		TCP: { "443": { HTTPS: true } },
		Web: {
			"cachyos.tail74b3f3.ts.net:443": {
				Handlers: { "/": { Proxy: `http://127.0.0.1:${port}` } },
			},
		},
	});
}

describe("magic dns host", () => {
	it("reads the machine name and strips the trailing dot", () => {
		const status = JSON.stringify({ Self: { DNSName: "cachyos.tail74b3f3.ts.net." } });

		expect(magicDnsHost(status)).toBe("cachyos.tail74b3f3.ts.net");
	});

	it("has no host when tailscale reports no name", () => {
		expect(magicDnsHost(JSON.stringify({ Self: { DNSName: "" } }))).toBeUndefined();
		expect(magicDnsHost(JSON.stringify({ BackendState: "Stopped" }))).toBeUndefined();
	});

	it("has no host when tailscale answered nothing at all", () => {
		expect(magicDnsHost("")).toBeUndefined();
		expect(magicDnsHost("failed to connect to local tailscaled")).toBeUndefined();
	});
});

describe("https certificates", () => {
	function status(capabilities: string[]): string {
		return JSON.stringify({
			Self: {
				DNSName: "cachyos.tail74b3f3.ts.net.",
				CapMap: Object.fromEntries(capabilities.map((capability) => [capability, null])),
			},
		});
	}

	it("reads the capability the tailnet grants", () => {
		expect(tailnetIssuesCertificates(status(["https", "https://tailscale.com/cap/is-admin"]))).toBe(true);
	});

	it("says no when the capability is missing", () => {
		expect(tailnetIssuesCertificates(status(["https://tailscale.com/cap/is-admin"]))).toBe(false);
	});

	it("says no when the node reports no capabilities at all", () => {
		expect(tailnetIssuesCertificates(JSON.stringify({ Self: { DNSName: "cachyos.tail74b3f3.ts.net." } })))
			.toBe(false);
	});

	it("leaves the answer to serve when tailscale itself is not answering", () => {
		expect(tailnetIssuesCertificates("")).toBe(true);
		expect(tailnetIssuesCertificates(JSON.stringify({ BackendState: "Stopped" }))).toBe(true);
	});
});

describe("tailnet address", () => {
	it("takes the IPv4 address the node answers on", () => {
		const status = JSON.stringify({ Self: { TailscaleIPs: ["100.105.249.8", "fd7a:115c:a1e0::d201:f909"] } });

		expect(tailnetAddress(status)).toBe("100.105.249.8");
	});

	it("skips a node that only has an IPv6 address", () => {
		expect(tailnetAddress(JSON.stringify({ Self: { TailscaleIPs: ["fd7a:115c:a1e0::d201:f909"] } })))
			.toBeUndefined();
	});

	it("has no address when tailscale answered nothing", () => {
		expect(tailnetAddress("")).toBeUndefined();
		expect(tailnetAddress(JSON.stringify({ BackendState: "Stopped" }))).toBeUndefined();
	});
});

describe("serve exposure", () => {
	it("sees the loopback port proxied on 443", () => {
		expect(serveExposes(serveStatus(SERVER_DEFAULT_PORT), SERVER_DEFAULT_PORT)).toBe(true);
	});

	it("ignores a serve config pointing at another port", () => {
		expect(serveExposes(serveStatus(3000), SERVER_DEFAULT_PORT)).toBe(false);
	});

	it("ignores a proxy published on another port than 443", () => {
		const status = JSON.stringify({
			Web: {
				"cachyos.tail74b3f3.ts.net:8443": {
					Handlers: { "/": { Proxy: serveProxyTarget(SERVER_DEFAULT_PORT) } },
				},
			},
		});

		expect(serveExposes(status, SERVER_DEFAULT_PORT)).toBe(false);
	});

	it("is not exposed with no serve config", () => {
		expect(serveExposes("{}", SERVER_DEFAULT_PORT)).toBe(false);
		expect(serveExposes("No serve config", SERVER_DEFAULT_PORT)).toBe(false);
	});
});

describe("serve command", () => {
	it("proxies 443 to the loopback port in the background", () => {
		expect(serveArgs({ enabled: true, port: SERVER_DEFAULT_PORT })).toEqual([
			"serve",
			"--bg",
			"--https=443",
			`http://127.0.0.1:${SERVER_DEFAULT_PORT}`,
		]);
	});

	it("proxies to the renderer dev server while one is running", () => {
		process.env.ELECTRON_RENDERER_URL = "http://127.0.0.1:4697/";

		try {
			expect(serveArgs({ enabled: true, port: SERVER_DEFAULT_PORT })).toEqual([
				"serve",
				"--bg",
				"--https=443",
				"http://127.0.0.1:4697",
			]);
			expect(serveExposes(serveStatus(4697), SERVER_DEFAULT_PORT)).toBe(true);
			expect(serveExposes(serveStatus(SERVER_DEFAULT_PORT), SERVER_DEFAULT_PORT)).toBe(false);
		} finally {
			delete process.env.ELECTRON_RENDERER_URL;
		}
	});

	it("turns the 443 handler off", () => {
		expect(serveArgs({ enabled: false, port: SERVER_DEFAULT_PORT })).toEqual([
			"serve",
			"--https=443",
			"off",
		]);
	});
});

describe("serve problem", () => {
	it("answers a denied config with the operator remedy", () => {
		expect(serveProblem(OPERATOR_DENIAL)).toBe(TAILSCALE_OPERATOR_REMEDY);
	});

	it("reports the first line of any other failure", () => {
		expect(serveProblem("error: failed to remove web serve: handler does not exist\n\ntry --help"))
			.toBe("error: failed to remove web serve: handler does not exist");
	});

	it("says tailscale is missing when it said nothing", () => {
		expect(serveProblem("")).toContain("Tailscale is not answering");
	});
});
