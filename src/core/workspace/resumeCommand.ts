import { Harnesses } from "@core/harness/registry";
import type { WorkspaceCommand } from "@core/store/workspace";

function shellToken(token: string): string {
	if (/^[\w@%+=:,./-]+$/.test(token)) {
		return token;
	}

	return `'${token.replaceAll("'", `'"'"'`)}'`;
}

function shellCommand(tokens: string[]): string {
	return tokens.map(shellToken).join(" ");
}

export function buildResumeCommand(input: WorkspaceCommand): string {
	const integration = Harnesses.get(input.session.harness);
	const argv = input.kind === undefined ? undefined : input.argv;
	return shellCommand(integration.launch.resume(input.session.sessionId, argv));
}

export function buildFreshCommand(input: WorkspaceCommand): string | null {
	const integration = Harnesses.get(input.session.harness);
	if (input.kind === undefined) {
		return null;
	}

	const tokens = integration.launch.fresh(input.argv);
	return tokens ? shellCommand(tokens) : null;
}
