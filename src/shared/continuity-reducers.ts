import type { ContinuitySessionRef, ContinuityShell, ContinuityValue, ContinuityWorkspace } from "@main/store/continuity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";

export interface ShellAddress {
	projectId: string;
	shellId: string;
}

interface Candidate {
	shell: ContinuityShell;
	own: boolean;
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

function idleSince(shell: ContinuityShell): number {
	return shell.lastTouchedAt ?? shell.createdAt;
}

function isOpen(shell: ContinuityShell, now: number): boolean {
	return shell.archivedAt === undefined && idleSince(shell) >= now - SESSION_AUTO_ARCHIVE_MS;
}

function pinnedIfStale(shell: ContinuityShell, now: number): ContinuityShell {
	if (shell.archivedAt !== undefined || isOpen(shell, now)) {
		return shell;
	}

	return { ...shell, archivedAt: idleSince(shell) };
}

export function withSelection(value: ContinuityValue, selectedShellId: string | undefined): ContinuityValue {
	if (!selectedShellId) {
		const { selectedShellId: _selectedShellId, ...rest } = value;

		return rest;
	}

	return { ...value, selectedShellId };
}

function successorOf(value: ContinuityValue, left: ShellAddress & { now: number }): string | undefined {
	const others = value.workspaces
		.flatMap((workspace) =>
			workspace.shells
				.filter((shell) => shell.id !== left.shellId)
				.map((shell): Candidate => ({ shell, own: workspace.projectId === left.projectId })),
		)
		.sort((first, second) => second.shell.createdAt - first.shell.createdAt || first.shell.id.localeCompare(second.shell.id));

	const preferences = [
		(candidate: Candidate) => candidate.own && isOpen(candidate.shell, left.now),
		(candidate: Candidate) => isOpen(candidate.shell, left.now),
		(candidate: Candidate) => candidate.own,
	];

	for (const preference of preferences) {
		const found = others.find(preference);

		if (found) {
			return found.shell.id;
		}
	}

	return others[0]?.shell.id;
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
	openShell: (
		value: ContinuityValue,
		input: { projectId: string; shell: Pick<ContinuityShell, "id" | "label" | "plain">; now: number },
	): ContinuityValue => {
		const known = value.workspaces.some((workspace) => workspace.projectId === input.projectId);
		const mounted = known
			? value
			: { ...value, workspaces: [...value.workspaces, { projectId: input.projectId, shells: [] }] };

		return mapWorkspace(withSelection(mounted, input.shell.id), input.projectId, (workspace) => ({
			...workspace,
			shells: workspace.shells.some((shell) => shell.id === input.shell.id)
				? workspace.shells
				: [...workspace.shells, { ...input.shell, createdAt: input.now }],
		}));
	},

	closeShell: (value: ContinuityValue, input: ShellAddress & { now: number }): ContinuityValue => {
		const closed = mapWorkspace(value, input.projectId, (workspace) => ({
			...workspace,
			shells: workspace.shells.filter((shell) => shell.id !== input.shellId),
		}));

		if (value.selectedShellId !== input.shellId) {
			return closed;
		}

		return withSelection(closed, successorOf(closed, input));
	},

	selectShell: (value: ContinuityValue, input: ShellAddress & { now: number }): ContinuityValue => {
		const workspace = value.workspaces.find((entry) => entry.projectId === input.projectId);

		if (!workspace?.shells.some((shell) => shell.id === input.shellId)) {
			return value;
		}

		return mapShell(withSelection(value, input.shellId), input, (shell) => pinnedIfStale(shell, input.now));
	},

	archiveShell: (value: ContinuityValue, input: ShellAddress & { now: number }): ContinuityValue => {
		const archived = mapShell(value, input, (shell) => ({ ...shell, archivedAt: input.now }));

		if (value.selectedShellId !== input.shellId) {
			return archived;
		}

		return withSelection(archived, successorOf(archived, input));
	},

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

	purgeProject: (value: ContinuityValue, input: { projectId: string; now: number }): ContinuityValue => {
		const purged = {
			...value,
			workspaces: value.workspaces.filter((workspace) => workspace.projectId !== input.projectId),
		};
		const selected = value.workspaces
			.find((workspace) => workspace.projectId === input.projectId)
			?.shells.find((shell) => shell.id === value.selectedShellId);

		if (!selected) {
			return purged;
		}

		return withSelection(purged, successorOf(purged, { ...input, shellId: selected.id }));
	},
};
