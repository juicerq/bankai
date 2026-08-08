import { type } from "arktype";
import { Logger } from "@main/infra/logger";
import { Store } from "@main/store/store";
import {
	ContinuityReducers,
	type OpenedShell,
	type ShellAddress,
	type ShellName,
	withSelection,
} from "@shared/continuity-reducers";
import {
	type ContinuitySessionRef,
	type ContinuityShell,
	type ContinuityValue,
	continuitySchema,
	continuitySessionRefSchema,
	continuityShellSchema,
} from "@shared/continuity";

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
			"session?": continuitySessionRefSchema,
			"lastTouchedAt?": "number",
			"branch?": "string",
			"title?": "string",
		}).array(),
	}).array(),
}).pipe((legacy) => ({
	...legacy,
	workspaces: legacy.workspaces.map((workspace) => ({
		...workspace,
		shells: workspace.shells.map((shell) => ({ ...shell, createdAt: shell.lastTouchedAt ?? 0 })),
	})),
}));

const selectionPerWorkspaceSchema = type({
	"activeProjectId?": "string",
	workspaces: type({
		projectId: "string",
		"activeShellId?": "string",
		shells: continuityShellSchema.array(),
	}).array(),
}).pipe((legacy): ContinuityValue =>
	withSelection(
		{
			workspaces: legacy.workspaces.map(({ activeShellId: _activeShellId, ...workspace }) => workspace),
		},
		legacy.workspaces.find((workspace) => workspace.projectId === legacy.activeProjectId)?.activeShellId,
	),
);

const modelNamedShellSchema = continuityShellSchema
	.merge({
		"titleSource?": "'user' | 'published' | 'model' | 'harness'",
		"namings?": "number",
	})
	.pipe(({ namings: _namings, ...shell }): ContinuityShell => {
		if (shell.titleSource === "published") {
			return { ...shell, titleSource: "harness" };
		}

		if (shell.titleSource === "model" || (shell.session && !shell.titleSource)) {
			const { title: _title, titleSource: _titleSource, ...unnamed } = shell;

			return unnamed;
		}

		const { titleSource, ...current } = shell;
		if (titleSource === "user" || titleSource === "harness") {
			return { ...current, titleSource };
		}

		return current;
	});

const modelNamedShellsSchema = type({
	"selectedShellId?": "string",
	workspaces: type({ projectId: "string", shells: modelNamedShellSchema.array() }).array(),
});

export const CONTINUITY_STORE_VERSION = 10;

const store = new Store({
	name: "continuity",
	version: CONTINUITY_STORE_VERSION,
	contract: continuitySchema,
	migrators: {
		1: (raw) => shellsWithoutCwdSchema.assert(raw),
		2: (raw) => raw,
		3: (raw) => raw,
		4: (raw) => shellsWithoutCreatedAtSchema.assert(raw),
		5: (raw) => selectionPerWorkspaceSchema.assert(raw),
		6: (raw) => raw,
		7: (raw) => raw,
		8: (raw) => raw,
		9: (raw) => modelNamedShellsSchema.assert(raw),
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

	openShell: (input: {
		projectId: string;
		shell: OpenedShell;
	}): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.openShell(current, { ...input, now: Date.now() })),

	closeShell: (input: ShellAddress): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.closeShell(current, { ...input, now: Date.now() })),

	selectShell: (input: ShellAddress): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.selectShell(current, { ...input, now: Date.now() })),

	archiveShell: (input: ShellAddress): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.archiveShell(current, { ...input, now: Date.now() })),

	unarchiveShell: (input: ShellAddress): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.unarchiveShell(current, { ...input, now: Date.now() })),

	pinShell: (input: ShellAddress): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.pinShell(current, { ...input, now: Date.now() })),

	unpinShell: (input: ShellAddress): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.unpinShell(current, input)),

	renameShell: (input: ShellAddress & { title: string }): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.renameShell(current, input)),

	nameShell: (input: ShellAddress & ShellName): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.nameShell(current, input)),

	touchShell: (input: ShellAddress & { branch: string; title?: string }): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.touchShell(current, { ...input, now: Date.now() })),

	startTurn: (input: ShellAddress): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.startTurn(current, input)),

	finishTurn: (input: ShellAddress & { at: number }): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.finishTurn(current, input)),

	setShellSession: (input: ShellAddress & { session: ContinuitySessionRef }): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.setShellSession(current, input)),

	clearShellSession: (input: ShellAddress): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.clearShellSession(current, input)),

	findShell: async (input: ShellAddress): Promise<ContinuityShell | undefined> => {
		const value = await store.read();
		const workspace = value.workspaces.find((entry) => entry.projectId === input.projectId);

		return workspace?.shells.find((shell) => shell.id === input.shellId);
	},

	purgeProject: (projectId: string): Promise<ContinuityValue> =>
		mutate((current) => ContinuityReducers.purgeProject(current, { projectId, now: Date.now() })),
};
