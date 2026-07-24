import { type } from "arktype";
import { Logger } from "@main/logger";
import { Store } from "@main/store/Store";

const sessionRefSchema = type({ harness: "string", sessionId: "string", cwd: "string" });

const shellSchema = type({ id: "string", label: "string", "session?": sessionRefSchema });

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
}).pipe((legacy): ContinuityValue => ({
	...legacy,
	workspaces: legacy.workspaces.map((workspace) => ({
		...workspace,
		shells: workspace.shells.map((shell) => ({ id: shell.id, label: shell.label })),
	})),
}));

const store = new Store({
	name: "continuity",
	version: 2,
	contract: continuitySchema,
	migrators: { 1: (raw) => shellsWithoutCwdSchema.assert(raw) },
	seed: (): ContinuityValue => ({ workspaces: [] }),
});

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

	activateProject: (projectId: string): Promise<ContinuityValue> =>
		store.mutate((current) => ({ ...current, activeProjectId: projectId })),

	openShell: (input: { projectId: string; shell: ContinuityShell }): Promise<ContinuityValue> =>
		store.mutate((current) =>
			upsertWorkspace(current, input.projectId, (workspace) => {
				const shells = workspace.shells.some((shell) => shell.id === input.shell.id)
					? workspace.shells
					: [...workspace.shells, input.shell];

				return { ...workspace, shells, activeShellId: input.shell.id };
			}),
		),

	closeShell: (input: { projectId: string; shellId: string }): Promise<ContinuityValue> =>
		store.mutate((current) =>
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

	moveShell: (input: { projectId: string; shellId: string; toIndex: number }): Promise<ContinuityValue> =>
		store.mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) => {
				const others = workspace.shells.filter((shell) => shell.id !== input.shellId);
				const moved = workspace.shells.filter((shell) => shell.id === input.shellId);

				return {
					...workspace,
					shells: [...others.slice(0, input.toIndex), ...moved, ...others.slice(input.toIndex)],
				};
			}),
		),

	selectShell: (input: { projectId: string; shellId: string }): Promise<ContinuityValue> =>
		store.mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) =>
				workspace.shells.some((shell) => shell.id === input.shellId)
					? { ...workspace, activeShellId: input.shellId }
					: workspace,
			),
		),

	setShellSession: (input: {
		projectId: string;
		shellId: string;
		session: ContinuitySessionRef;
	}): Promise<ContinuityValue> =>
		store.mutate((current) =>
			mapWorkspace(current, input.projectId, (workspace) => ({
				...workspace,
				shells: workspace.shells.map((shell) =>
					shell.id === input.shellId ? { ...shell, session: input.session } : shell,
				),
			})),
		),

	clearShellSession: (input: { projectId: string; shellId: string }): Promise<ContinuityValue> =>
		store.mutate((current) =>
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

	shellSession: async (input: {
		projectId: string;
		shellId: string;
	}): Promise<ContinuitySessionRef | undefined> => {
		const value = await store.read();
		const workspace = value.workspaces.find((entry) => entry.projectId === input.projectId);
		return workspace?.shells.find((shell) => shell.id === input.shellId)?.session;
	},

	purgeProject: (projectId: string): Promise<ContinuityValue> =>
		store.mutate((current) => {
			const workspaces = current.workspaces.filter((workspace) => workspace.projectId !== projectId);
			if (current.activeProjectId === projectId) {
				return { workspaces };
			}

			return { ...current, workspaces };
		}),
};
