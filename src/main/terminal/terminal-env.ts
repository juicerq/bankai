const INHERITED_AGENT_SESSION_VARS = [
	"CLAUDECODE",
	"CLAUDE_CODE_CHILD_SESSION",
	"CLAUDE_CODE_ENTRYPOINT",
	"CLAUDE_CODE_EXECPATH",
	"CLAUDE_CODE_SESSION_ID",
	"CLAUDE_PID",
];

function terminalEnv(source: Record<string, string | undefined>): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined && !INHERITED_AGENT_SESSION_VARS.includes(key)) {
			env[key] = value;
		}
	}

	return { ...env, TERM: "xterm-256color", COLORTERM: "truecolor", COLORFGBG: "15;0" };
}

export const TerminalEnv = {
	of: terminalEnv,
};
