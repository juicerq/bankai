import type { ContinuitySessionRef, ContinuityShell, ContinuityValue, ContinuityWorkspace } from "@main/store/continuity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";

export interface ShellAddress {
	projectId: string;
	shellId: string;
}

function mapWorkspace(
	value: ContinuityValue,
	projectId: string,
	fn: (workspace: ContinuityWorkspace) => ContinuityWorkspace,
): ContinuityValue {
	return {
		...value,
		workspaces: value.workspaces.map((workspace) => (workspace.projectId === projectId ? fn(workspace) : workspace)),
	};
}

function mapShell(
	value: ContinuityValue,
	address: ShellAddress,
	fn: (shell: ContinuityShell) => ContinuityShell,
): ContinuityValue {
	return mapWorkspace(value, address.projectId, (workspace) => ({
		...workspace,
		shells: workspace.shells.map((shell) => (shell.id === address.shellId ? fn(shell) : shell)),
	}));
}

function pinnedIfStale(shell: ContinuityShell, now: number): ContinuityShell {
	const idleSince = shell.lastTouchedAt ?? shell.createdAt;

	if (shell.archivedAt !== undefined || idleSince >= now - SESSION_AUTO_ARCHIVE_MS) {
		return shell;
	}

	return { ...shell, archivedAt: idleSince };
}

export function nextShellNumber(shells: Pick<ContinuityShell, "label">[]): number {
	const numbers = shells
		.map((shell) => /^Shell (\d+)$/.exec(shell.label))
		.filter((match) => match !== null)
		.map((match) => Number(match[1]));

	if (numbers.length === 0) {
		return 1;
	}

	return Math.max(...numbers) + 1;
}

export const ContinuityReducers = {
	activateProject: (value: ContinuityValue, projectId: string): ContinuityValue => ({
		...value,
		activeProjectId: projectId,
	}),

	openShell: (
		value: ContinuityValue,
		input: { projectId: string; shell: Pick<ContinuityShell, "id" | "label" | "plain">; now: number },
	): ContinuityValue => {
		const known = value.workspaces.some((workspace) => workspace.projectId === input.projectId);
		const mounted = known
			? value
			: { ...value, workspaces: [...value.workspaces, { projectId: input.projectId, shells: [] }] };

		return mapWorkspace(mounted, input.projectId, (workspace) => ({
			...workspace,
			activeShellId: input.shell.id,
			shells: workspace.shells.some((shell) => shell.id === input.shell.id)
				? workspace.shells
				: [...workspace.shells, { ...input.shell, createdAt: input.now }],
		}));
	},

	closeShell: (value: ContinuityValue, address: ShellAddress): ContinuityValue =>
		mapWorkspace(value, address.projectId, (workspace) => {
			const index = workspace.shells.findIndex((shell) => shell.id === address.shellId);

			if (index === -1) {
				return workspace;
			}

			const shells = workspace.shells.filter((shell) => shell.id !== address.shellId);

			if (workspace.activeShellId !== address.shellId) {
				return { ...workspace, shells };
			}

			const heir = shells[Math.max(0, index - 1)];

			if (!heir) {
				const { activeShellId: _activeShellId, ...rest } = workspace;

				return { ...rest, shells };
			}

			return { ...workspace, shells, activeShellId: heir.id };
		}),

	selectShell: (value: ContinuityValue, input: ShellAddress & { now: number }): ContinuityValue =>
		mapWorkspace(value, input.projectId, (workspace) =>
			workspace.shells.some((shell) => shell.id === input.shellId)
				? {
					...workspace,
					activeShellId: input.shellId,
					shells: workspace.shells.map((shell) =>
						shell.id === input.shellId ? pinnedIfStale(shell, input.now) : shell,
					),
				}
				: workspace,
		),

	archiveShell: (value: ContinuityValue, input: ShellAddress & { now: number }): ContinuityValue =>
		mapShell(value, input, (shell) => ({ ...shell, archivedAt: input.now })),

	unarchiveShell: (value: ContinuityValue, input: ShellAddress & { now: number }): ContinuityValue =>
		mapShell(value, input, ({ archivedAt: _archivedAt, ...shell }) => ({ ...shell, lastTouchedAt: input.now })),

	renameShell: (value: ContinuityValue, input: ShellAddress & { title: string }): ContinuityValue =>
		mapShell(value, input, (shell) => ({ ...shell, title: input.title })),

	touchShell: (
		value: ContinuityValue,
		input: ShellAddress & { branch: string; title?: string; now: number },
	): ContinuityValue =>
		mapShell(value, input, (shell) => {
			const touched: ContinuityShell = { ...shell, lastTouchedAt: input.now, branch: input.branch };
			const title = shell.title ?? input.title;

			if (title) {
				touched.title = title;
			}

			return touched;
		}),

	setShellSession: (value: ContinuityValue, input: ShellAddress & { session: ContinuitySessionRef }): ContinuityValue =>
		mapShell(value, input, (shell) => ({ ...shell, session: input.session })),

	clearShellSession: (value: ContinuityValue, address: ShellAddress): ContinuityValue =>
		mapShell(value, address, ({ session: _session, ...shell }) => shell),

	purgeProject: (value: ContinuityValue, projectId: string): ContinuityValue => {
		const workspaces = value.workspaces.filter((workspace) => workspace.projectId !== projectId);

		if (value.activeProjectId !== projectId) {
			return { ...value, workspaces };
		}

		const { activeProjectId: _activeProjectId, ...rest } = value;

		return { ...rest, workspaces };
	},
};
