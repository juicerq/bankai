import { plainText } from "@main/terminal/ShellOutputLines";

const COMPACTION_MARKER = "Compacting conversation";

export const COMPACTION_TRACE = "Compacting";

export function matchesCompactionNotice(text: string): boolean {
	return plainText(text).includes(COMPACTION_MARKER);
}
