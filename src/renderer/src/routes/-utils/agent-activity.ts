import type { AgentActivityState } from "@shared/activity";

export const ACTIVITY_DOT_CLASS: Record<AgentActivityState, string> = {
	working: "bg-tertiary",
	"needs-attention": "bg-terminal-blue",
	"done-unseen": "bg-added",
};

export const ACTIVITY_BORDER_CLASS: Record<AgentActivityState, string> = {
	working: "border-l-tertiary",
	"needs-attention": "border-l-terminal-blue",
	"done-unseen": "border-l-added",
};

export const ACTIVITY_TEXT_CLASS: Record<AgentActivityState, string> = {
	working: "text-tertiary",
	"needs-attention": "text-terminal-blue",
	"done-unseen": "text-added",
};

export function projectDotClass(activity: AgentActivityState | undefined): string {
	if (!activity) {
		return "bg-outline-strong";
	}

	return ACTIVITY_DOT_CLASS[activity];
}
