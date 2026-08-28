import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { RepoPath } from "@main/git/repo-path";
import { Store } from "@main/store/store";
import { type } from "arktype";
import { type Project, projectSchema } from "@shared/projects";
import {
	ReviewDefaultClosure,
	type ReviewClosedTarget,
} from "@shared/review-default-closure";

const projectsContract = projectSchema.array();
const projectsV1Contract = type({
	id: "string",
	name: "string",
	path: "string",
	createdAt: "number",
}).array();

const store = new Store({
	name: "projects",
	version: 2,
	contract: projectsContract,
	migrators: {
		1: (raw) => projectsV1Contract.assert(raw).map((project) => ({ ...project, reviewClosedTargets: [] })),
	},
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
					reviewClosedTargets: [],
				},
			];
		});
		const project = projects.find((candidate) => candidate.path === normalizedPath);
		if (!project) {
			throw new Error(`Failed to add project: ${normalizedPath}`);
		}
		return project;
	},
	setReviewClosedTarget: async (
		projectId: string,
		target: ReviewClosedTarget,
		closed: boolean,
	): Promise<Project> => {
		const project = await Projects.find(projectId);
		await RepoPath.assertWithin({ root: project.path, file: target.path });
		const projects = await store.mutate((current) => current.map((candidate) =>
			candidate.id === projectId
				? {
					...candidate,
					reviewClosedTargets: ReviewDefaultClosure.update(candidate.reviewClosedTargets, target, closed),
				}
				: candidate,
		));
		const updated = projects.find((candidate) => candidate.id === projectId);
		if (!updated) {
			throw new Error(`Project not found: ${projectId}`);
		}
		return updated;
	},
};
