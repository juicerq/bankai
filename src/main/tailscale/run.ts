import { execFile } from "node:child_process";

const TAILSCALE_TIMEOUT_MS = 8000;

export interface TailscaleResult {
	stdout: string;
	stderr: string;
	failed: boolean;
}

export function tailscale(args: string[]): Promise<TailscaleResult> {
	return new Promise((resolve) => {
		execFile(
			"tailscale",
			args,
			{ timeout: TAILSCALE_TIMEOUT_MS, windowsHide: true },
			(err, stdout, stderr) => {
				resolve({ stdout, stderr: stderr || (err?.message ?? ""), failed: !!err });
			},
		);
	});
}
