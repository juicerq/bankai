import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { type } from "arktype";
import { Store } from "@main/store/store";

const projectSchema = type({
	id: "string",
	name: "string",
	path: "string",
	createdAt: "number",
});

const projectsContract = projectSchema.array();

export type Project = typeof projectSchema.infer;

const store = new Store({
	name: "projects",
	version: 1,
	contract: projectsContract,
	migrators: {},
	seed: (): Project[] => [],
});

export const Projects = {
	list: store.read.bind(store),
	find: async (id: string): Promise<Project> => {
		const project = (await store.read()).find((candidate) => candidate.id === id);
		if (!project) {
			throw new Error(`Project not found: ${id}`);
		}
		return project;
	},
	remove: async (id: string) => {
		await store.mutate((current) => current.filter((project) => project.id !== id));
	},
	add: async (path: string): Promise<Project> => {
		const normalizedPath = resolve(path);
		const projects = await store.mutate((current) => {
			if (current.some((project) => project.path === normalizedPath)) {
				return current;
			}

			return [
				...current,
				{
					id: randomUUID(),
					name: basename(normalizedPath),
					path: normalizedPath,
					createdAt: Date.now(),
				},
			];
		});
		const project = projects.find((candidate) => candidate.path === normalizedPath);
		if (!project) {
			throw new Error(`Failed to add project: ${normalizedPath}`);
		}
		return project;
	},
};
