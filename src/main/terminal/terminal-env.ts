const INHERITED_PROCESS_VARS = [
	"ELECTRON_RENDERER_URL",
	"ELECTRON_RUN_AS_NODE",
	"NODE_ENV",
	"NO_COLOR",
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
		if (value !== undefined && !INHERITED_PROCESS_VARS.includes(key)) {
			env[key] = value;
		}
	}

	return { ...env, TERM: "xterm-256color", COLORTERM: "truecolor", COLORFGBG: "15;0" };
}

export const TerminalEnv = {
	of: terminalEnv,
};
