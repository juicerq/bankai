import type { AgentActivityState } from "@shared/activity";

export const ACTIVITY_DOT_CLASS: Record<AgentActivityState, string> = {
	working: "bg-terminal-blue",
	"needs-attention": "bg-tertiary",
	"done-unseen": "bg-added",
};

export const ACTIVITY_TEXT_CLASS: Record<AgentActivityState, string> = {
	working: "text-terminal-blue",
	"needs-attention": "text-tertiary",
	"done-unseen": "text-added",
};
