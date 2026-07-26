import { type } from "arktype";
import { Logger } from "@main/logger";
import { Store } from "@main/store/Store";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";

const sessionRefSchema = type({ harness: "string", sessionId: "string", cwd: "string" });

const shellSchema = type({
	id: "string",
	label: "string",
	createdAt: "number",
	"session?": sessionRefSchema,
	"lastTouchedAt?": "number",
	"branch?": "string",
	"title?": "string",
	"archivedAt?": "number",
});

const workspaceSchema = type({
	projectId: "string",
	"activeShellId?": "string",
	shells: shellSchema.array(),
});

const continuitySchema = type({
	"activeProjectId?": "string",
	workspaces: workspaceSchema.array(),
});

export type ContinuitySessionRef = typeof sessionRefSchema.infer;
export type ContinuityShell = typeof shellSchema.infer;
export type ContinuityWorkspace = typeof workspaceSchema.infer;
export type ContinuityValue = typeof continuitySchema.infer;

const shellsWithoutCwdSchema = type({
	"activeProjectId?": "string",
	workspaces: type({
		projectId: "string",
		"activeShellId?": "string",
		shells: type({ id: "string", label: "string" }).array(),
	}).array(),
}).pipe((legacy) => ({
	...legacy,
	workspaces: legacy.workspaces.map((workspace) => ({
		...workspace,
		shells: workspace.shells.map((shell) => ({ id: shell.id, label: shell.label })),
	})),
}));

const shellsWithoutCreatedAtSchema = type({
	"activeProjectId?": "string",
	workspaces: type({
		projectId: "string",
		"activeShellId?": "string",
		shells: type({
			id: "string",
			label: "string",
			"session?": sessionRefSchema,
			"lastTouchedAt?": "number",
			"branch?": "string",
			"title?": "string",
		}).array(),
	}).array(),
}).pipe((legacy): ContinuityValue => ({
	...legacy,
	workspaces: legacy.workspaces.map((workspace) => ({
		...workspace,
		shells: workspace.shells.map((shell) => ({ ...shell, createdAt: shell.lastTouchedAt ?? 0 })),
	})),
}));

const store = new Store({
	name: "continuity",
	version: 5,
	contract: continuitySchema,
	migrators: {
		1: (raw) => shellsWithoutCwdSchema.assert(raw),
		2: (raw) => raw,
		3: (raw) => raw,
		4: (raw) => shellsWithoutCreatedAtSchema.assert(raw),
	},
	seed: (): ContinuityValue => ({ workspaces: [] }),
});

const listeners = new Set<(value: ContinuityValue) => void>();

async function mutate(fn: (current: ContinuityValue) => ContinuityValue): Promise<ContinuityValue> {
	const value = await store.mutate(fn);

	for (const listener of listeners) {
		listener(value);
	}

	return value;
}

function emptyValue(): ContinuityValue {
	return { workspaces: [] };
}

function upsertWorkspace(
	current: ContinuityValue,
	projectId: string,
	fn: (workspace: ContinuityWorkspace) => ContinuityWorkspace,
): ContinuityValue {
	const present = current.workspaces.some((workspace) => workspace.projectId === projectId);
	const workspaces = present
		? current.workspaces
		: [...current.workspaces, { projectId, shells: [] }];

	return {
		...current,
		workspaces: workspaces.map((workspace) => (workspace.projectId === projectId ? fn(workspace) : workspace)),
	};
}

function mapWorkspace(
	current: ContinuityValue,
	projectId: string,
	fn: (workspace: ContinuityWorkspace) => ContinuityWorkspace,
): ContinuityValue {
	return {
		...current,
		workspaces: current.workspaces.map((workspace) => (workspace.projectId === projectId ? fn(workspace) : workspace)),
	};
}

function unarchived(shell: ContinuityShell): ContinuityShell {
	const { archivedAt: _archivedAt, ...rest } = shell;

	return { ...rest, lastTouchedAt: Date.now() };
}

function pinnedIfStale(shell: ContinuityShell): ContinuityShell {
	const idleSince = shell.lastTouchedAt ?? shell.createdAt;
	if (shell.archivedAt !== undefined || idleSince >= Date.now() - SESSION_AUTO_ARCHIVE_MS) {
		return shell;
	}

	return { ...shell, archivedAt: idleSince };
}

function touchedShell(shell: ContinuityShell, input: { branch: string; title?: string }): ContinuityShell {
	const touched: ContinuityShell = { ...shell, lastTouchedAt: Date.now(), branch: input.branch };
	const title = shell.title ?? input.title;
	if (title) {
		touched.title = title;
	}

	return touched;
}

export const Continuity = {
	load: async (): Promise<{ value: ContinuityValue; failed: boolean }> => {
		try {
			return { value: await store.read(), failed: false };
		} catch (err) {
			Logger.error("continuity: load failed, resetting to empty", { err: String(err) });
			const value = emptyValue();
			await store.write(value).catch((writeErr) => {
				Logger.error("continuity: reset write failed", { err: String(writeErr) });
			});
			return { value, failed: true };
		}
	},

	subscribe: (listener: (value: ContinuityValue) => void): (() => void) => {
		listeners.add(listener);

		return () => {
			listeners.delete(listener);
		};
	},

	activateProject: (projectId: string): Promise<ContinuityValue> =>
		mutate((current) => ({ ...current, activeProjectId: projectId })),

	openShell: (input: {
		projectId: string;
		shell: Pick<ContinuityShell, "id" | "label">;
	}): Promise<ContinuityValue> =>
		mutate((current) =>
			upsertWorkspace(current, input.projectId, (workspace) => {
				const shells = workspace.shells.some((shell) => shell.id === input.shell.id)
					? workspace.shells
					: [...workspace.shells, { ...input.shell, createdAt: Date.now() }];

				return { ...workspace, shells, activeShellId: input.shell.id };
			}),
		),

	closeShell: (input: { projectId: string; shellId: string }): Promise<ContinuityValue> =>
		mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) => {
				const index = workspace.shells.findIndex((shell) => shell.id === input.shellId);
				if (index === -1) {
					return workspace;
				}

				const shells = workspace.shells.filter((shell) => shell.id !== input.shellId);
				if (workspace.activeShellId !== input.shellId) {
					return { ...workspace, shells };
				}

				const next: ContinuityWorkspace = { ...workspace, shells };
				const neighbor = shells[Math.max(0, index - 1)];
				if (neighbor) {
					next.activeShellId = neighbor.id;
				} else {
					delete next.activeShellId;
				}

				return next;
			}),
		),

	selectShell: (input: { projectId: string; shellId: string }): Promise<ContinuityValue> =>
		mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) =>
				workspace.shells.some((shell) => shell.id === input.shellId)
					? {
						...workspace,
						activeShellId: input.shellId,
						shells: workspace.shells.map((shell) =>
							shell.id === input.shellId ? pinnedIfStale(shell) : shell,
						),
					}
					: workspace,
			),
		),

	archiveShell: (input: { projectId: string; shellId: string }): Promise<ContinuityValue> =>
		mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) => ({
				...workspace,
				shells: workspace.shells.map((shell) =>
					shell.id === input.shellId ? { ...shell, archivedAt: Date.now() } : shell,
				),
			})),
		),

	unarchiveShell: (input: { projectId: string; shellId: string }): Promise<ContinuityValue> =>
		mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) => ({
				...workspace,
				shells: workspace.shells.map((shell) => (shell.id === input.shellId ? unarchived(shell) : shell)),
			})),
		),

	renameShell: (input: { projectId: string; shellId: string; title: string }): Promise<ContinuityValue> =>
		mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) => ({
				...workspace,
				shells: workspace.shells.map((shell) =>
					shell.id === input.shellId ? { ...shell, title: input.title } : shell,
				),
			})),
		),

	touchShell: (input: {
		projectId: string;
		shellId: string;
		branch: string;
		title?: string;
	}): Promise<ContinuityValue> =>
		mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) => ({
				...workspace,
				shells: workspace.shells.map((shell) =>
					shell.id === input.shellId ? touchedShell(shell, input) : shell,
				),
			})),
		),

	setShellSession: (input: {
		projectId: string;
		shellId: string;
		session: ContinuitySessionRef;
	}): Promise<ContinuityValue> =>
		mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) => ({
				...workspace,
				shells: workspace.shells.map((shell) =>
					shell.id === input.shellId ? { ...shell, session: input.session } : shell,
				),
			})),
		),

	clearShellSession: (input: { projectId: string; shellId: string }): Promise<ContinuityValue> =>
		mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) => ({
				...workspace,
				shells: workspace.shells.map((shell) => {
					if (shell.id !== input.shellId) {
						return shell;
					}

					const { session: _session, ...rest } = shell;
					return rest;
				}),
			})),
		),

	findShell: async (input: { projectId: string; shellId: string }): Promise<ContinuityShell | undefined> => {
		const value = await store.read();
		const workspace = value.workspaces.find((entry) => entry.projectId === input.projectId);
		return workspace?.shells.find((shell) => shell.id === input.shellId);
	},

	purgeProject: (projectId: string): Promise<ContinuityValue> =>
		mutate((current) => {
			const workspaces = current.workspaces.filter((workspace) => workspace.projectId !== projectId);
			if (current.activeProjectId === projectId) {
				return { workspaces };
			}

			return { ...current, workspaces };
		}),
};
