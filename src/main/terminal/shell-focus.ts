const shellByConnection = new Map<string, string | undefined>();

function focusShell(
	connection: { id: string; onClose: (cleanup: () => void) => void },
	shellId?: string,
): void {
	if (!shellByConnection.has(connection.id)) {
		connection.onClose(() => shellByConnection.delete(connection.id));
	}

	shellByConnection.set(connection.id, shellId);
}

function shellFocused(shellId: string): boolean {
	for (const focused of shellByConnection.values()) {
		if (focused === shellId) {
			return true;
		}
	}

	return false;
}

export const ShellFocus = {
	focus: focusShell,
	isFocused: shellFocused,
};
