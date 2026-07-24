const ATTENTION_PROMPT_MARKERS = [
	"tell Claude what to do differently",
	"keep planning",
] as const;

export const ATTENTION_SCAN_WINDOW = 4096;

export function matchesAttentionPrompt(text: string): boolean {
	return ATTENTION_PROMPT_MARKERS.some((marker) => text.includes(marker));
}
