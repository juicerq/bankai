import { randomUUID } from "node:crypto";
import { type } from "arktype";
import { Store } from "@main/store/Store";

const commandSchema = type({
	id: "string",
	projectId: "string",
	label: "string",
	command: "string",
	createdAt: "number",
});

export const commandDraftSchema = type({
	label: type("string").atLeastLength(1).atMostLength(60),
	command: type("string").atLeastLength(1).atMostLength(2000),
});

export type ProjectCommand = typeof commandSchema.infer;
export type ProjectCommandDraft = typeof commandDraftSchema.infer;

const store = new Store({
	name: "commands",
	version: 1,
	contract: commandSchema.array(),
	migrators: {},
	seed: (): ProjectCommand[] => [],
});

export const ProjectCommands = {
	list: async (projectId: string): Promise<ProjectCommand[]> =>
		(await store.read()).filter((command) => command.projectId === projectId),

	find: async (id: string): Promise<ProjectCommand> => {
		const command = (await store.read()).find((candidate) => candidate.id === id);
		if (!command) {
			throw new Error(`Command not found: ${id}`);
		}

		return command;
	},

	add: async (input: ProjectCommandDraft & { projectId: string }): Promise<ProjectCommand> => {
		const command = { id: randomUUID(), createdAt: Date.now(), ...input };
		await store.mutate((current) => [...current, command]);

		return command;
	},

	update: async (input: ProjectCommandDraft & { id: string }): Promise<ProjectCommand> => {
		const updated = await store.mutate((current) =>
			current.map((command) => (command.id === input.id ? { ...command, ...input } : command))
		);
		const command = updated.find((candidate) => candidate.id === input.id);
		if (!command) {
			throw new Error(`Command not found: ${input.id}`);
		}

		return command;
	},

	remove: async (id: string): Promise<void> => {
		await store.mutate((current) => current.filter((command) => command.id !== id));
	},

	purgeProject: async (projectId: string): Promise<void> => {
		await store.mutate((current) => current.filter((command) => command.projectId !== projectId));
	},
};
