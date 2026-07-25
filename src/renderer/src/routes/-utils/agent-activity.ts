import type { AgentActivityState } from "@shared/activity";

export const ACTIVITY_DOT_CLASS: Record<AgentActivityState, string> = {
	working: "bg-tertiary",
	"needs-attention": "bg-terminal-blue",
	"done-unseen": "bg-added",
};

export const ACTIVITY_TEXT_CLASS: Record<AgentActivityState, string> = {
	working: "text-tertiary",
	"needs-attention": "text-terminal-blue",
	"done-unseen": "text-added",
};
