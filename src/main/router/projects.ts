import { stat } from "node:fs/promises";
import { type } from "arktype";
import { dialog, shell } from "electron";
import { browseDirectories, expandUserPath } from "@main/fs/directories";
import { base } from "@main/router/_base";
import { Services } from "@main/services/Services";
import { ProjectCommands } from "@main/store/commands";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";

export const projectsRouter = {
	list: base.handler(() => Projects.list()),
	browse: base.input(type({ path: "string" })).handler(({ input }) => browseDirectories(input.path)),
	add: base.input(type({ path: "string" })).handler(async ({ input }) => {
		const path = expandUserPath(input.path);
		const directory = await stat(path).catch(() => null);
		if (!directory?.isDirectory()) {
			throw new Error(`Not a directory: ${path}`);
		}

		return await Projects.add(path);
	}),
	openDirectory: base.input(type({ projectId: "string" })).handler(async ({ input }) => {
		const project = await Projects.find(input.projectId);
		const error = await shell.openPath(project.path);
		if (error) {
			throw new Error(error);
		}
	}),
	remove: base.input(type({ projectId: "string" })).handler(async ({ input }) => {
		await Projects.find(input.projectId);
		Services.stopProject(input.projectId);
		await Projects.remove(input.projectId);
		await ProjectCommands.purgeProject(input.projectId);
		await Continuity.purgeProject(input.projectId);
	}),
	chooseDirectory: base.handler(async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory"],
			title: "Add project",
		});
		const path = result.filePaths[0];
		if (result.canceled || !path) {
			return null;
		}
		return await Projects.add(path);
	}),
};
