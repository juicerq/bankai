import { describe, expect, it } from "bun:test";
import { TailscaleAccess } from "@main/infra/tailscale/tailscale-access";
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

		expect(TailscaleAccess.magicDns(status)).toBe("cachyos.tail74b3f3.ts.net");
	});

	it("has no host when tailscale reports no name", () => {
		expect(TailscaleAccess.magicDns(JSON.stringify({ Self: { DNSName: "" } }))).toBeUndefined();
		expect(TailscaleAccess.magicDns(JSON.stringify({ BackendState: "Stopped" }))).toBeUndefined();
	});

	it("has no host when tailscale answered nothing at all", () => {
		expect(TailscaleAccess.magicDns("")).toBeUndefined();
		expect(TailscaleAccess.magicDns("failed to connect to local tailscaled")).toBeUndefined();
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
		expect(TailscaleAccess.issuesCertificates(status(["https", "https://tailscale.com/cap/is-admin"]))).toBe(true);
	});

	it("says no when the capability is missing", () => {
		expect(TailscaleAccess.issuesCertificates(status(["https://tailscale.com/cap/is-admin"]))).toBe(false);
	});

	it("says no when the node reports no capabilities at all", () => {
		expect(TailscaleAccess.issuesCertificates(JSON.stringify({ Self: { DNSName: "cachyos.tail74b3f3.ts.net." } })))
			.toBe(false);
	});

	it("leaves the answer to serve when tailscale itself is not answering", () => {
		expect(TailscaleAccess.issuesCertificates("")).toBe(true);
		expect(TailscaleAccess.issuesCertificates(JSON.stringify({ BackendState: "Stopped" }))).toBe(true);
	});
});

describe("tailnet address", () => {
	it("takes the IPv4 address the node answers on", () => {
		const status = JSON.stringify({ Self: { TailscaleIPs: ["100.105.249.8", "fd7a:115c:a1e0::d201:f909"] } });

		expect(TailscaleAccess.address(status)).toBe("100.105.249.8");
	});

	it("skips a node that only has an IPv6 address", () => {
		expect(TailscaleAccess.address(JSON.stringify({ Self: { TailscaleIPs: ["fd7a:115c:a1e0::d201:f909"] } })))
			.toBeUndefined();
	});

	it("has no address when tailscale answered nothing", () => {
		expect(TailscaleAccess.address("")).toBeUndefined();
		expect(TailscaleAccess.address(JSON.stringify({ BackendState: "Stopped" }))).toBeUndefined();
	});
});

describe("serve exposure", () => {
	it("sees the loopback port proxied on 443", () => {
		expect(TailscaleAccess.exposes(serveStatus(SERVER_DEFAULT_PORT), SERVER_DEFAULT_PORT)).toBe(true);
	});

	it("ignores a serve config pointing at another port", () => {
		expect(TailscaleAccess.exposes(serveStatus(3000), SERVER_DEFAULT_PORT)).toBe(false);
	});

	it("ignores a proxy published on another port than 443", () => {
		const status = JSON.stringify({
			Web: {
				"cachyos.tail74b3f3.ts.net:8443": {
					Handlers: { "/": { Proxy: TailscaleAccess.proxyTarget(SERVER_DEFAULT_PORT) } },
				},
			},
		});

		expect(TailscaleAccess.exposes(status, SERVER_DEFAULT_PORT)).toBe(false);
	});

	it("is not exposed with no serve config", () => {
		expect(TailscaleAccess.exposes("{}", SERVER_DEFAULT_PORT)).toBe(false);
		expect(TailscaleAccess.exposes("No serve config", SERVER_DEFAULT_PORT)).toBe(false);
	});
});

describe("serve command", () => {
	it("proxies 443 to the loopback port in the background", () => {
		expect(TailscaleAccess.serveArgs({ enabled: true, port: SERVER_DEFAULT_PORT })).toEqual([
			"serve",
			"--bg",
			"--https=443",
			`http://127.0.0.1:${SERVER_DEFAULT_PORT}`,
		]);
	});

	it("proxies to the renderer dev server while one is running", () => {
		process.env.ELECTRON_RENDERER_URL = "http://127.0.0.1:4697/";

		try {
			expect(TailscaleAccess.serveArgs({ enabled: true, port: SERVER_DEFAULT_PORT })).toEqual([
				"serve",
				"--bg",
				"--https=443",
				"http://127.0.0.1:4697",
			]);
			expect(TailscaleAccess.exposes(serveStatus(4697), SERVER_DEFAULT_PORT)).toBe(true);
			expect(TailscaleAccess.exposes(serveStatus(SERVER_DEFAULT_PORT), SERVER_DEFAULT_PORT)).toBe(false);
		} finally {
			delete process.env.ELECTRON_RENDERER_URL;
		}
	});

	it("turns the 443 handler off", () => {
		expect(TailscaleAccess.serveArgs({ enabled: false, port: SERVER_DEFAULT_PORT })).toEqual([
			"serve",
			"--https=443",
			"off",
		]);
	});
});

describe("serve problem", () => {
	it("answers a denied config with the operator remedy", () => {
		expect(TailscaleAccess.problem(OPERATOR_DENIAL)).toBe(TailscaleAccess.TAILSCALE_OPERATOR_REMEDY);
	});

	it("reports the first line of any other failure", () => {
		expect(TailscaleAccess.problem("error: failed to remove web serve: handler does not exist\n\ntry --help"))
			.toBe("error: failed to remove web serve: handler does not exist");
	});

	it("says tailscale is missing when it said nothing", () => {
		expect(TailscaleAccess.problem("")).toContain("Tailscale is not answering");
	});
});
