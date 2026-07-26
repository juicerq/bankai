/* eslint-disable no-control-regex */
const OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const CSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const ESCAPE = /\u001b[@-Z\\-_]/g;
const CONTROL = /[\u0000-\u001f\u007f]/g;
const READABLE = /[\p{L}\p{N}]/u;

const LINE_LIMIT = 160;
const TAIL_LIMIT = 4096;

const tails = new Map<string, string>();
const lines = new Map<string, string>();

export function plainText(raw: string): string {
	return raw
		.replaceAll(OSC, "")
		.replaceAll(CSI, "")
		.replaceAll(ESCAPE, "")
		.replaceAll(CONTROL, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function outputLine(segment: string): string | null {
	const clean = plainText(segment);

	if (!clean || !READABLE.test(clean)) {
		return null;
	}

	return clean.slice(0, LINE_LIMIT);
}

export function noteShellOutput(shellId: string, data: string): void {
	const segments = ((tails.get(shellId) ?? "") + data).split(/\r\n|\n|\r/);
	const partial = segments.pop() ?? "";

	for (const segment of segments.reverse()) {
		const line = outputLine(segment);
		if (line) {
			lines.set(shellId, line);
			break;
		}
	}

	tails.set(shellId, partial.slice(-TAIL_LIMIT));
}

export const shellOutputLines: ReadonlyMap<string, string> = lines;

export function forgetShellOutput(shellId: string): void {
	lines.delete(shellId);
	tails.delete(shellId);
}
