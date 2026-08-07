import type { ProcReader } from "@main/terminal/shell-agents";

export function readerOf(table: Record<number, string | undefined>): ProcReader {
	return {
		pids: async () => Object.keys(table).map(Number),
		environ: async (pid) => table[pid],
	};
}

export function environ(entries: Record<string, string>): string {
	return `${Object.entries(entries)
		.map(([key, value]) => `${key}=${value}`)
		.join("\0")}\0`;
}
